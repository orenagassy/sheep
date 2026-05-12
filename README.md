# 🐑 Sheep Gates

A browser game where you bet on the open gate and survive as long as you can.

![Sheep Gates](screenshot.png)

**[Play now →](https://orenagassy.github.io/sheep/)**

---

## How to play

7 gates per row — pick an open one to keep walking. Every 7 gates, one more gate locks:

| Level | Open gates |
|-------|-----------|
| 1 | 6 of 7 |
| 2 | 5 of 7 |
| … | … |
| 6 | 1 of 7 |

Use the 🐮 **Hint** button to reveal one bad gate — once per run. Lucky sheep sometimes find a hint hiding behind an open gate.

Scores sync to a shared global leaderboard. Top 10 of all time.

---

## Test mode

Add `?test` to the URL to enable test mode. It pre-marks which open gate hides a hint (shown with 💡) and skips leaderboard saving.

```
https://orenagassy.github.io/sheep/?test
```

---

## Tech

Single `index.html` — no build step, no dependencies.

- SVG sheep with animated walking legs
- Web Audio API for procedural sounds
- Animated clouds, twinkling stars, swaying grass, day/night cycle across levels
- Crash particles, confetti, floating score, hoof-print trail, screen shake
- Scores proxied through a [Cloudflare Worker](https://workers.cloudflare.com/) — API key never reaches the browser
- Leaderboard stored on [JSONBin](https://jsonbin.io/)
