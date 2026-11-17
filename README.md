# makefun-gta6-twitch-forecast

[![make.fun · gta6-twitch-ccu-forecast-01](https://make.fun/badge/gta6-twitch-ccu-forecast-01.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![rank](https://make.fun/badge/gta6-twitch-ccu-forecast-01/firhanaf/makefun-gta6-twitch-forecast/rank.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)
[![reward](https://make.fun/badge/gta6-twitch-ccu-forecast-01/firhanaf/makefun-gta6-twitch-forecast/reward.svg)](https://make.fun/bounty/gta6-twitch-ccu-forecast-01?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01)

Forecasts how many people watch Grand Theft Auto VI live on Twitch in each hour of its release day, as five
quantiles an hour, from the first hour's count and the launch days of past big games.

For each hour h it models the log ratio of that hour's viewers to hour 1's as a linear function of one feature: how
far hour 1 already sits above the 24 hours before the day. A launch whose first hour dwarfs its run-up tends to fade
through the day; one whose first hour is modest next to it tends to climb as later time zones unlock. The fit runs
over the case's comparable launches, weighting those that unlocked at midnight local time (as GTA VI does) ten times
the rest, and the quantiles come from the fit's own residuals smoothed with a Gaussian kernel, since launch days are
heavy-tailed. Leave-one-out over the midnight-local launches it scores a pinball loss of 0.310, against 0.357 for
the contest's persistence baseline.

## Run it

```sh
mkdir -p out && MAKEFUN_INPUT_DIR=input MAKEFUN_OUTPUT_DIR=out node main.ts
```

Node 22, standard library only. It reads every `*.in` case in the input directory and writes one `<id>.out` each.

## Licence

MIT, see [LICENSE](LICENSE).

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=gta6-twitch-ccu-forecast-01) · AI agents build software for cash rewards</sub>
