# 📦 산출물 3. 개발된 소프트웨어 — RAG 기반 LLM과 벡터DB 연동 코드

> KBO 직관 안내 챗봇 · SKN34 3차 5팀 · 기준일 2026-09-16 (develop)
> 이 문서는 **코드가 어디서 어떻게 연결되는지**를 따라가며 설명합니다. 코드 조각은 실제 파일에서 옮겼고, 길이를 줄이려고 일부만 실었습니다.

---

## 0. 한눈에 보기

```text
[오프라인 인덱싱]                                   [요청마다 서빙]
build_index.py                                      llm/chat_service.py      ← ① 채팅 API가 RAG 체인을 부름
  ├ build_chunks()  행 → 텍스트 · doc_id              llm/rag/pipeline.py      ← ② 백엔드 진입점 (Runnable)
  ├ embed()         OpenAI 임베딩 · 체크포인트          llm/rag/dispatcher.py    ← ③ 범위 판단 · 실패 시 대체
  └ load()          DocumentChunk 적재                llm/rag/assistant/
        │                                               ├ pipeline.py          ← ④ retrieve | prompt | agent | parse
        ▼                                               ├ tools.py             ← ⑤ DB 조회 · 문서 검색 · 코스 도구
llm/models.py  DocumentChunk (vector 1536, HNSW)  ◀──  └ prompts.py
                                                    llm/rag/club/retrieval.py ← ⑥ pgvector 검색 + 키워드 재정렬
                                                    llm/rag/persona.py        ← ⑦ 말투 · 경고 문구
```

| 파일 | 줄 수 | 역할 |
| --- | ---: | --- |
| `backend/llm/models.py` | 85 | 벡터 테이블 정의 |
| `backend/llm/management/commands/build_index.py` | 390 | 인덱싱 |
| `backend/llm/rag/club/retrieval.py` | 114 | 임베딩 · 벡터 검색 · 재정렬 |
| `backend/llm/rag/assistant/pipeline.py` | 152 | LangChain 파이프라인 |
| `backend/llm/rag/assistant/tools.py` | 372 | 에이전트 도구 9개 |
| `backend/llm/rag/dispatcher.py` | 176 | 범위 판단 · 대체 경로 |
| `backend/llm/rag/pipeline.py` | 239 | 백엔드 진입점 |
| `backend/llm/chat_service.py` | 185 | 채팅 서비스 연결 지점 |

---

## 1. 벡터DB 스키마 — `llm/models.py`

PostgreSQL에 pgvector 확장을 쓰고, Django 모델로 테이블과 HNSW 인덱스를 함께 정의합니다. 별도 벡터DB 서버 없이 **정형 데이터와 같은 DB**에 둬서 운영이 단순합니다.

```python
from pgvector.django import VectorField, HnswIndex

class DocumentChunk(models.Model):
    document = models.ForeignKey(Document, on_delete=models.CASCADE, related_name="chunks")
    content = models.TextField()
    chunk_index = models.IntegerField()
    metadata = models.JSONField(default=dict)      # doc_id · category · stadium_code · status · evidence_type …
    embedding = VectorField(dimensions=1536)       # text-embedding-3-small
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        indexes = [
            HnswIndex(
                name="chunk_embedding_hnsw",
                fields=["embedding"],
                m=16,
                ef_construction=64,
                opclasses=["vector_cosine_ops"],    # 코사인 거리 (<=>)
            ),
        ]
```

---

## 2. 인덱싱 — `build_index.py`

```bash
python manage.py build_index --dry-run   # 청크만 만들고 검사 (비용 0)
python manage.py build_index             # 임베딩 + 적재
```

### 2-1. 청크 만들기 — 행 하나 = 청크 하나

```python
def add(source, category, stadium_code, team_code, natural, text, meta):
    scope = stadium_code or team_code or "COMMON"
    base = f"{category}_{scope}_{natural}"                 # 사람이 읽을 수 있는 doc_id
    seen[base] += 1
    doc_id = base if seen[base] == 1 else f"{base}_{seen[base]}"   # 자연키 중복 17행 → _2, _3
    meta = clean_meta(meta)
    meta.update({"doc_id": doc_id, "category": category, "stadium_code": stadium_code,
                 "team_code": team_code, "source_file": source})
    chunks.append({"source": source, "category": category, "stadium_code": stadium_code,
                   "doc_id": doc_id, "content": text, "metadata": meta})

for fname, (category, key_cols) in CSV_SPEC.items():
    for r in read_csv(fname).to_dict("records"):
        ...
        header = stadium_ko.get(sc, sc or "전 구장")        # "잠실야구장 · LG 트윈스"
        text = row_text(header, r)                           # "[잠실야구장 · LG 트윈스] zone_name_ko: 프리미엄석 / …"
        if str(r.get("status", "")).upper() not in ("CONFIRMED", "CONFIRMED_OFFICIAL", "NAN", ""):
            text += UNCERTAIN_NOTE                            # 불확실한 행은 본문에도 경고를 넣음
        add(fname, category, sc, tc, "_".join(str(r.get(c, "")) for c in key_cols), text, r)
```

**포인트**

- 구장·팀 이름을 **본문 맨 앞에** 넣어, 메타데이터 필터가 없어도 임베딩이 어느 구장 이야기인지 알게 합니다.
- 확정되지 않은 행은 본문에 "공식 확인 전 정보" 문구를 넣어, 프롬프트 규칙과 함께 **이중 안전장치**가 됩니다.
- 반입·재입장 JSON은 `rules_to_sentences()`로 `{"carrier": "N"}` → "캐리어는 반입할 수 없습니다."처럼 문장으로 바꿉니다.

### 2-2. 임베딩 — 같은 입력이면 다시 부르지 않음

```python
def embed(self, texts):
    fingerprint = hashlib.sha256("\n".join(texts).encode()).hexdigest()
    vecs = []
    if ckpt.exists() and fp.exists() and fp.read_text() == fingerprint:
        vecs = list(np.load(ckpt))                       # 이전 결과 재사용 → API 호출 0
    fp.write_text(fingerprint)

    model = OpenAIEmbeddings(model=EMBEDDING_MODEL)
    for i in range(len(vecs), len(texts), EMBED_BATCH):  # 100건씩
        vecs.extend(model.embed_documents(texts[i:i + EMBED_BATCH]))
        if len(vecs) % CHECKPOINT_EVERY < EMBED_BATCH:   # 500건마다 저장 → 중간에 끊겨도 이어서
            np.save(ckpt, np.array(vecs, dtype=np.float32))
    return np.array(vecs, dtype=np.float32)
```

### 2-3. 적재 — 트랜잭션 한 번

```python
@transaction.atomic
def load(self, chunks, vecs):
    DocumentChunk.objects.all().delete()
    Document.objects.all().delete()
    ...
    DocumentChunk.objects.bulk_create(objs, batch_size=500)
```

### 2-4. 적재 전 자동 검사

| 검사 | 기대값 |
| --- | --- |
| 총 청크 | 3,839 ± 200 |
| `stadium_code` 없음 | 12 (공통 반입 1 + 기초규칙 11) |
| doc_id 중복 | 0 |
| 50자 미만 청크 | 확인 후 판단 |

---

## 3. 벡터 검색 — `llm/rag/club/retrieval.py`

### 3-1. 질문 임베딩 (클라이언트는 한 번만 생성)

```python
EMBED_MODEL = os.getenv("EMBEDDING_MODEL") or "text-embedding-3-small"   # 적재 때와 반드시 같아야 함
EF_SEARCH = 200            # 평가 결과: 40은 후보 유실, 200은 유실 0
_embedder = None

def embed(text):
    global _embedder
    if _embedder is None:
        _embedder = OpenAIEmbeddings(model=EMBED_MODEL)
    return _embedder.embed_query(text)
```

### 3-2. 메타데이터 필터 + HNSW 검색

```python
def _where(stadium=None, categories=None, must_text=None):
    conds, params = [], {}
    if stadium:
        # 공통 반입규정·기초규칙은 stadium_code 가 null → 어느 구장 질문에도 같이 포함
        conds.append("(metadata->>'stadium_code' = %(st)s OR metadata->>'stadium_code' IS NULL)")
        params["st"] = stadium
    if categories:
        conds.append("metadata->>'category' = ANY(%(cats)s)")
        params["cats"] = list(categories)
    ...

def search(qvec, k=5, stadium=None, categories=None, ef_search=EF_SEARCH, must_text=None):
    where, params = _where(stadium, categories, must_text)
    params.update(v="[" + ",".join(map(str, qvec)) + "]", k=k)
    sql = f"""
        SELECT metadata->>'doc_id' AS doc_id, metadata->>'stadium_code' AS stadium,
               metadata->>'category' AS category, metadata->>'status' AS status,
               metadata->>'evidence_type' AS evidence_type, content,
               embedding <=> %(v)s::vector AS dist
        FROM llm_documentchunk {where}
        ORDER BY embedding <=> %(v)s::vector
        LIMIT %(k)s"""
    t0 = time.perf_counter()
    with transaction.atomic(), connection.cursor() as cur:
        cur.execute(f"SET LOCAL hnsw.ef_search = {int(ef_search)}")   # 이 요청에서만 적용
        cur.execute(sql, params)
        rows = [dict(zip([c[0] for c in cur.description], r)) for r in cur.fetchall()]
    return rows, (time.perf_counter() - t0) * 1000                    # 검색 시간 따로 기록
```

### 3-3. 키워드 재정렬 (가벼운 하이브리드)

```python
def keyword_rerank(question, rows, k=5, alpha=0.3, date_bonus=1.0):
    """벡터 점수 + 키워드 일치. 날짜가 정확히 같은 청크는 크게 가산"""
    toks = keywords(question)             # 조사 제거, "9월 12일" → "-09-12"
    if not toks:
        return rows[:k]
    dates = [t for t in toks if DATE.fullmatch(t)]

    def score(r):
        body = r["content"].upper()
        s = (1 - r["dist"]) + alpha * sum(t.upper() in body for t in toks) / len(toks)
        if dates and any(d in body for d in dates):
            s += date_bonus
        return s

    return sorted(rows, key=score, reverse=True)[:k]
```

> 별도 리랭커 모델 없이 **k×3개를 뽑아 재정렬 → 상위 k개**. 이 단계로 Hit@5가 86.7% → 93.3%로 올랐습니다 (산출물 4 참고).

---

## 4. LangChain 파이프라인 — `llm/rag/assistant/pipeline.py`

```python
chain = RunnableLambda(retrieve) | RunnableLambda(build_prompt) | agent | RunnableLambda(parse_output)
```

### 4-1. retrieve — 질문으로 먼저 검색

```python
def retrieve(inputs, _search=None, _embed=None):
    question = inputs["question"]
    stadium = stadium_for(question, inputs.get("history"), inputs.get("hint"))   # 질문 → 직전 대화 → 화면 선택 순
    cats = [c for c in detect_categories(question) if c not in ("SCHEDULE", "STANDING")] or None  # 일정·순위는 DB가 정본
    try:
        rows = tools.search_documents(question, stadium, cats, k=CONTEXT_K)      # CONTEXT_K = 6
    except Exception:
        log.exception("rag retrieve failed")
        rows = []                                                                # 검색이 실패해도 답은 계속
    tools.add_sources(rows)
    return {**inputs, "stadium": stadium, "context": tools.format_documents(rows), "doc_count": len(rows)}
```

`tools.search_documents()`는 `search(k*3)` → `keyword_rerank(k)` 순으로 부르고, 카테고리 필터로 0건이면 필터를 풀고 한 번 더 찾습니다.

### 4-2. build_prompt — 규칙 + 문서 + 오늘 날짜 + 대화

```python
def build_prompt(inputs):
    system = (SYSTEM.replace("{today}", date.today().isoformat())
              .replace("{stadium_hint}", hint_line)
              .replace("{context}", inputs.get("context") or "검색 결과 없음")
              .replace("{route_hint}", route_hint(inputs["question"])))   # 코스·주변 질문이면 알맞은 도구 힌트
    past = [...][-HISTORY_TURNS:]                                          # 최근 대화 8개
    return {"messages": [SystemMessage(content=system), *past, HumanMessage(content=inputs["question"])]}
```

**시스템 프롬프트 핵심 (`assistant/prompts.py`)**

```text
<참고 문서> 는 이번 질문으로 우리 문서 DB 를 먼저 검색한 결과다. …
도구 쓰는 법
1. 경기 일정·결과 → get_games / 순위 → get_standings / 가격 → get_ticket_prices / 예매 → get_ticket_policy
   일정·순위·결과·가격은 참고 문서보다 이 도구 결과를 믿는다.
…
답변 규칙
1. 참고 문서와 도구 결과에 있는 사실만 말한다. 시각·가격·점수·순위·주소·장소 이름을 지어내지 않는다.
2. 구장이 필요한 질문인데 구장이 없으면 되묻는다.
3. 취소·환불 규정은 "예매처에 문의하시기 바랍니다." 라고만 답한다.
4. 근거 등급이 UNOFFICIAL·UNCERTAIN·THIRD_PARTY 이면 확인 안내 문구를 마지막 줄에 붙인다.
5. SQL·테이블명·도구 이름 같은 내부 용어는 답변에 쓰지 않는다.
```

### 4-3. agent — 필요할 때만 도구 호출

```python
def build_chain(model=None, tool_list=None, retriever=None):
    model = model or ChatOpenAI(model=LLM_MODEL, temperature=0, timeout=25,
                                max_retries=0, reasoning_effort="none")
    agent = create_agent(model=model, tools=tool_list if tool_list is not None else tools.build_tools())
    return RunnableLambda(retriever or retrieve) | RunnableLambda(build_prompt) | agent | RunnableLambda(parse_output)

def chain():                        # 서버 기동 후 한 번만 만들고 재사용
    global _chain
    if _chain is None:
        _chain = build_chain()
    return _chain
```

### 4-4. parse_output · answer — 결과 정리

```python
def answer(question, history=None, hint_stadium=None, _chain_obj=None):
    st = tools.new_state(hint_stadium, question=question, history=history)   # 요청별 상태 (ContextVar)
    t0 = time.perf_counter()
    text = (_chain_obj or chain()).invoke(
        {"question": question, "history": history or [], "hint": hint_stadium},
        config={"recursion_limit": RECURSION_LIMIT},                          # 도구 호출 4~5번까지
    )
    course = st.get("course") or {}
    if course.get("places"):
        text = course["answer"]              # 지도에 그린 코스와 글이 어긋나지 않게
    if not text:
        raise ValueError("agent returned no answer")   # → 디스패처가 기존 도메인으로 재시도
    return {
        "answer": text,
        "sources": st["sources"],
        "route": "agent:rag" + ("," + ",".join(dict.fromkeys(st["tools"])) if st["tools"] else ""),
        "timing": {"agent_ms": round((time.perf_counter() - t0) * 1000), "tool_calls": len(st["tools"])},
        # 코스를 짰으면 places · coursePayload · stadiumCode · travel 도 함께
    }
```

---

## 5. 에이전트 도구 — `llm/rag/assistant/tools.py`

```python
def build_tools():
    def tool(fn, schema):
        return StructuredTool.from_function(fn, name=fn.__name__, args_schema=schema, description=fn.__doc__,
            handle_validation_error="도구 인자 형식이 올바르지 않습니다. 설명을 보고 다시 부르세요.")
    return [
        tool(get_games, GamesInput), tool(get_standings, StandingsInput),
        tool(get_ticket_prices, PricesInput), tool(get_ticket_policy, PolicyInput),
        tool(get_baseball_schema, NoInput), tool(execute_baseball_select, SelectInput),
        tool(search_kbo_documents, SearchInput), tool(search_nearby_places, NearbyInput), tool(plan_course, CourseInput),
    ]
```

**DB 조회 도구는 읽기 전용 서비스를 거침**

```python
def _run_fixed(name, sql, params, service=None):
    """코드에 고정한 SELECT 를 읽기 전용 계정으로 실행 (검증·타임아웃을 그대로 거친다)."""
    s = state()
    s["tools"].append(name)
    try:
        result = _service(service).execute_baseball_select(sql, params, FIXED_ROWS)   # BaseballQueryService
    except _errors() as exc:
        return f"조회 오류: {exc}"
    s["sources"].append({"doc_id": f"baseball_db:{name}", "grade": "OFFICIAL", "category": "DB"})
    return result
```

| 도구 | 입력 예시 | 동작 |
| --- | --- | --- |
| `get_games` | `team="KIA", status="upcoming", home_away="home"` | 조건에 맞는 경기 목록 + 전체 개수 |
| `get_standings` | `as_of="2026-09-13"` | 그 날짜 이전 가장 최근 순위 |
| `get_ticket_prices` | `team="LG", zone_keyword="응원"` | 좌석 가격 (싼 순) |
| `get_ticket_policy` | `team="두산"` | 예매 오픈·매수·예매처 |
| `get_baseball_schema` → `execute_baseball_select` | SELECT 1문장 | 스키마를 먼저 본 경우에만 실행, 최대 50행 |
| `search_kbo_documents` | `query, stadium_code, categories` | 추가 벡터 검색 |
| `search_nearby_places` | `kind="stay"` | 카카오 로컬, 가까운 순 |
| `plan_course` | 사용자 요청 문장 그대로 | course 도메인으로 코스 + 지도 좌표 |

---

## 6. 백엔드 연결 — `pipeline.py` · `dispatcher.py` · `chat_service.py`

### 6-1. 채팅 서비스에 꽂히는 한 줄

```python
# llm/chat_service.py
def _run(self, values):
    from .rag.pipeline import chat_chain      # 지연 import: RAG 모듈이 깨져도 서버 기동은 되게
    if rag := chat_chain():
        return rag.invoke(values)
    ...                                        # (테스트 중에만) 기존 도구 루프

def stream_with_history(self, messages, question):
    from .rag.pipeline import chat_chain
    if rag := chat_chain():
        yield from rag.stream({"question": question, "chat_history": messages})
        return
    ...
```

### 6-2. 채팅 서비스 규격을 맞추는 Runnable

```python
# llm/rag/pipeline.py
class RagChatChain(Runnable[dict, str]):
    """{"question", "chat_history"} → 답변 문자열. invoke 와 stream 둘 다 지원"""
    def invoke(self, input, config=None, **kwargs):
        return self.detail(input)["answer"]

    def stream(self, input, config=None, **kwargs):
        text = self.invoke(input, config, **kwargs)
        for i in range(0, len(text), STREAM_CHUNK):       # 24자씩 흘려 SSE 계약 유지
            yield text[i:i + STREAM_CHUNK]

def chat_chain():
    return rag_chain if use_rag() else None               # 테스트 러너 안에서만 None

@traceable(run_type="chain", name="kbo_rag.answer")      # LangSmith: 질문 1건 = 트리 1개
def answer(question, history=None, stadium_name=None, intent=None):
    q, prefixed = split_stadium_prefix(question)           # "[선택한 구장: 잠실야구장]" 접두어 분리
    result = dispatcher.answer(q, history=normalize_history(history),
                               stadium_name=stadium_name or prefixed, ...)
    ...
```

### 6-3. 디스패처 — 범위 판단과 실패 대체

```python
# llm/rag/dispatcher.py
def answer(question, history=None, stadium_name=None, intent=None):
    hint = stadium_code_from_name(stadium_name)            # "잠실야구장" → JAMSIL
    kind = route(question, intent)                         # 키워드·정규식, LLM 0회

    if kind == "scope":                                    # 야구와 무관
        return {"answer": persona.FIXED["scope"], "sources": [], "route": "dispatcher:scope", "places": []}
    try:
        result = assistant.answer(question, history=history, hint_stadium=hint)
    except Exception:
        log.exception("assistant pipeline failed — falling back to domain")
        result = _domain_answer(kind, question, history, hint)    # course · nearby · venue · club
        result["route"] = f"agent:error>{result['route']}"

    result["answer"] = persona.finalize(result["answer"])  # 말투 통일 · 경고 문구
    return result
```

---

## 7. 직접 실행해 보기

```bash
docker compose exec backend python manage.py shell
```

```python
>>> from llm.rag import answer
>>> r = answer("잠실 주차 얼마야?")
>>> r["route"]
'agent:rag'
>>> r = answer("오늘 이후 KIA 홈경기 몇 경기 남았어?")
>>> r["route"]
'agent:rag,get_games'
>>> r = answer("친구랑 잠실 경기 전후 걸어서 코스 짜줘")
>>> len(r["places"]), r["coursePayload"] is not None
```

> `route` 값으로 어떤 경로·도구를 거쳤는지 바로 확인할 수 있습니다. 위 출력 예시는 형식 설명용이며, 실제 값은 데이터·모델 응답에 따라 달라질 수 있습니다.

---

## 8. 설정값 정리

| 환경변수 / 상수 | 값 | 위치 |
| --- | --- | --- |
| `EMBEDDING_MODEL` | `text-embedding-3-small` (1536) | `.env` · 적재와 검색이 같아야 함 |
| `LLM_MODEL` | `gpt-5.6-luna` (기본) | `.env` |
| `CONTEXT_K` | 6 | `assistant/pipeline.py` |
| `HISTORY_TURNS` | 8 | `assistant/pipeline.py` |
| `AGENT_RECURSION_LIMIT` | 12 (도구 호출 약 4~5회) | `.env` |
| `EF_SEARCH` | 200 | `club/retrieval.py` |
| HNSW `m` / `ef_construction` | 16 / 64 | `models.py` |
| `EMBED_BATCH` / `CHECKPOINT_EVERY` | 100 / 500 | `build_index.py` |
| `BASEBALL_QUERY_MAX_ROWS` / `TIMEOUT_MS` | 200 / 3000 | `.env` |
| `LANGSMITH_TRACING` | `false` 기본 (키가 없으면 오버헤드 0) | `.env` |
