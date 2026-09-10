export const teamBoards = [
  { code: "LG", name: "LG 트윈스", shortName: "LG", stadium: "잠실야구장" },
  { code: "HH", name: "한화 이글스", shortName: "한화", stadium: "대전 한화생명 볼파크" },
  { code: "SK", name: "SSG 랜더스", shortName: "SSG", stadium: "인천 SSG 랜더스필드" },
  { code: "SS", name: "삼성 라이온즈", shortName: "삼성", stadium: "대구 삼성 라이온즈 파크" },
  { code: "NC", name: "NC 다이노스", shortName: "NC", stadium: "창원 NC 파크" },
  { code: "KT", name: "KT 위즈", shortName: "KT", stadium: "수원 KT 위즈 파크" },
  { code: "LT", name: "롯데 자이언츠", shortName: "롯데", stadium: "사직야구장" },
  { code: "HT", name: "KIA 타이거즈", shortName: "KIA", stadium: "광주-KIA 챔피언스 필드" },
  { code: "OB", name: "두산 베어스", shortName: "두산", stadium: "잠실야구장" },
  { code: "WO", name: "키움 히어로즈", shortName: "키움", stadium: "고척스카이돔" },
] as const;

export type TeamCommunityPost = {
  id: string;
  teamCode: string;
  category: string;
  title: string;
  content: string;
  isSample: true;
};

export function getTeamBoard(code: string) {
  return teamBoards.find(team => team.code === code.toUpperCase());
}

// Preview fixtures shared by the home page and community. Replace this adapter with the post API later.
// These examples are separate from saved route posts and do not imply real users or activity.
export function getTeamBoardPosts(code: string): TeamCommunityPost[] {
  const team = getTeamBoard(code);
  if (!team) return [];

  const examples = [
    { category: "응원", title: `${team.shortName} 팬 여러분, 오늘도 응원 한마디!`, content: `${team.name}를 응원하는 마음을 나누는 공간이에요. 좋아하는 응원 문구나 이번 직관에서 기대하는 순간을 이야기해 보세요.` },
    { category: "질문", title: `${team.stadium} 첫 직관, 무엇부터 챙길까요?`, content: `${team.stadium}에 처음 가는 팬들과 직관 준비 이야기를 나눠보세요. 입장 전 챙길 물건, 응원 준비물, 궁금한 점을 함께 이야기하는 글의 예시입니다.` },
    { category: "직관", title: "혼자 가도 함께 응원하는 우리 팀 직관", content: `혼자 즐기는 ${team.shortName} 직관은 어떤가요? 경기 전 시간을 보내는 방법이나 응원석에서 기억에 남았던 순간을 나누는 글의 예시입니다.` },
    { category: "잡담", title: `내가 ${team.shortName} 팬이 된 순간은?`, content: `처음 야구를 보게 된 계기, 기억에 남는 경기, ${team.name}를 좋아하게 된 이야기를 자유롭게 나눠보세요.` },
    { category: "질문", title: "경기 전후에 들르기 좋은 곳 추천해 주세요", content: `${team.stadium} 직관 전후로 들르고 싶은 곳이 있나요? 식사나 산책 이야기를 나누고, 마음에 드는 장소는 직관 루트로 만들어 보세요.` },
  ];

  return examples.map((post, index) => ({ ...post, id: `${team.code.toLowerCase()}-sample-${index + 1}`, teamCode: team.code, isSample: true }));
}

export function getTeamBoardHref(code?: string, postId?: string) {
  const params = new URLSearchParams({ board: "free" });
  if (code && getTeamBoard(code)) params.set("team", code.toUpperCase());
  if (postId) params.set("post", postId);
  return `/routes?${params.toString()}`;
}
