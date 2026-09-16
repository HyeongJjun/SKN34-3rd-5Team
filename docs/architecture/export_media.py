"""archify HTML → PNG · SVG · WebM 내보내기 (뷰어의 Export 메뉴를 자동으로 누름)

필요: pip install playwright && playwright install chromium
실행: python docs/architecture/export_media.py            # 6개 전부
      python docs/architecture/export_media.py ux_flow    # 하나만
결과: docs/images/<이름>.png · .svg,  docs/media/<이름>.webm
"""
import pathlib
import sys

from playwright.sync_api import sync_playwright

HERE = pathlib.Path(__file__).resolve().parent
DOCS = HERE.parent
NAMES = sys.argv[1:] or ["system_architecture", "chat_pipeline", "course_sequence",
                         "data_pipeline", "deploy_cicd", "ux_flow"]
TARGETS = [  # (메뉴 글자, 설명 글자, 확장자, 저장 폴더)
    ("PNG", "Lossless", "png", DOCS / "images"),
    ("SVG", "Editable", "svg", DOCS / "images"),
    ("WebM", "motion", "webm", DOCS / "media"),
]

with sync_playwright() as p:
    browser = p.chromium.launch()
    for name in NAMES:
        ctx = browser.new_context(viewport={"width": 1600, "height": 1000}, device_scale_factor=2,
                                  accept_downloads=True, color_scheme="light")
        page = ctx.new_page()
        page.goto((HERE / f"{name}.html").as_uri())
        page.wait_for_timeout(1200)
        for menu, hint, ext, folder in TARGETS:
            folder.mkdir(exist_ok=True)
            page.get_by_role("button", name="Export").first.click()
            page.wait_for_timeout(300)
            with page.expect_download(timeout=60000) as dl:
                page.locator("button", has_text=menu).filter(has_text=hint).first.click()
            dl.value.save_as(folder / f"{name}.{ext}")
            print(f"{name}.{ext} 저장")
            page.keyboard.press("Escape")
            page.wait_for_timeout(300)
        ctx.close()
    browser.close()
