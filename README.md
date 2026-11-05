# 予你星河 · Cinematic Galaxy Gift

A self-contained, static WebGL surprise gift. Open `index.html` through any static web server, choose **接受礼物 / Accept gift**, then tap the box.

- Three.js r169 (MIT), locally vendored; no runtime CDN or tracking.
- Procedural WebAudio sound and music. No audio recordings.
- Mobile-aware rendering: 34k galaxy particles on touch/low-power devices, 88k on desktop. DPR capped at 1.5 mobile / 2 desktop.
- Customise with `?to=小美&from=阿明&msg=生日快乐！愿你的每一天都像星河一样闪耀。` (URL-encode parameters when sharing).
- `?timeout=5` shortens the normal 60-second gift-expiry timer for testing.
- Browser fullscreen is requested where supported; iOS uses the full dynamic viewport (`100dvh`).
- Chinese display font is a small Noto Serif CJK SC subset (SIL Open Font License; see `assets/FONT-LICENSE.txt`). Custom name characters outside the subset use the device's system Chinese font.

This is a visual prototype, not a payment or gift-delivery product. WebGL2 and a modern browser are required. A device can be muted with the note button. Actual phone performance depends on GPU and browser.
