# Earthrise

Choosing a place and a date to land on the Moon

Earthrise helps you compare lunar landing plans. It shows when a lander has sunlight, how long it keeps power, and when Earth is visible.

## Why we built it

A lander is a spacecraft that reaches the ground. Solar-powered landers need sunlight to make electricity. When the Sun disappears, they use a battery. They also need a clear view toward Earth to send information directly home.

Near the Moon’s south pole, the Sun stays low. Hills can block it for days. Moving a short distance or landing a week later can change the result. Earthrise lets you check those changes in one place.

## The three numbers to look at first

**How long does the power last?** — The hours from landing until the first time the panel and battery cannot supply enough electricity. This includes time running on the battery, not just time in sunlight.

**When is Earth visible while we have power?** — The total hours when both conditions happen together. Earth appearing after the lander loses power does not count. These hours may be spread across several separate periods.

**How long does Earth stay hidden?** — The longest uninterrupted stretch without a view of Earth during the full forecast. A plan can have plenty of Earth-visible hours overall and still have a long gap.

## What a one-week delay changes

This example uses the same lander for three 30-day forecasts. It has a 4 m² panel, uses 200 watts and starts with a full 2 kWh battery. Arrivals are at midnight UTC in January 2027. The nearby summit is about 12 km away.

| Landing plan | Power lasts | Earth visible while powered | Longest time Earth is hidden |
| --- | --- | --- | --- |
| Original point: 1 January | 3 days, 4 hours | None | 9 days, 3 hours |
| Same point: 8 January | 10 hours | None | 13 days, 17 hours |
| Nearby summit: 8 January | All 30 days | 15 days, 12 hours | 12 days, 13 hours |

The delayed arrival runs on its battery for just 10 hours. The summit keeps power for the whole forecast, but Earth is still hidden for long stretches. Whether that is acceptable depends on the mission.

## Where the numbers come from

- The ground: NASA’s LRO/LOLA height maps show the hills around each point. The app checks what they block, including the Moon’s curved surface.

- The sky: JPL DE440 position data, prepared with NASA’s SPICE tools, tell us where the Sun and Earth are at each time.

- The battery: the app works out how much electricity the panel makes and the lander uses, then updates the battery hour by hour. For example, a full 2 kWh battery supplying 200 W lasts 10 hours without solar power.

These are estimates. Seeing Earth does not guarantee a working radio link. The app does not predict whether a lander survives extreme cold or restarts after losing power. Some region locations are approximate, and terrain uncertainty can shift the event times.

# What you can do in the app

The features, and how they answer the challenge

The challenge asks for an easy way to compare landing places and dates using sunlight and Earth visibility. Here is where each of its seven suggested feature areas appears in Earthrise.

| The challenge asks for… | Earthrise lets you… |
| --- | --- |
| Choose and compare locations | Pick from the 34 places in the catalogue (the Artemis III regions, landers’ sites, the Apollo landings, other countries’ landers, high points and crater floors), each marked with what kind of point it is, or enter a point south of 60° S. Compare up to four scenarios side by side: several sites on the same date with the same lander, or one plan beside a slipped landing or a nearby alternative, each with its own date and lander. |
| Change dates and times | Choose the landing date and hour in UTC and a length of 2 to 90 days; step it by an hour or a day, or shift it by any number of days or hours. In Compare, keep the original plan as the baseline beside a slipped landing. Position data cover 2024–2036. |
| See the Sun and Earth against the horizon | See their paths against the surrounding hills. Check the horizon chart and timeline to find when the Sun or Earth goes out of view. |
| Assess power and communication opportunities | Check the battery, the hours with power, the hours with Earth in view while powered and the longest time without Earth, with each window of Earth in view in UTC. Set what the mission needs in Explore’s Options or in the planner; see which choices meet it and why others do not. |
| Use different views | Switch between a shadow map, 3D ground and horizon chart. “Stand on the Moon” shows the view from the site, including the Sun, Earth and stars. |
| Watch conditions change over time | Move the time bar or press Play. Follow the shadows, Sun, Earth and battery together. Markers highlight important changes. |
| Help beginners and experienced users | Start with a short answer, then open the detailed numbers. “How it works” explains the science. The layout works on phones and computers, with light and dark themes and simpler graphics when needed. |

## A few other useful features

- Plan a landing: say or type what the mission needs. The planner tries every site and landing time you allow and ranks them: the requirements first, then the longest time with power, or your priorities for power, Earth in view and shorter gaps, weighed by a stated rule rather than a trained model.

- Find another landing time: search the next 12 months, every sixth hour, ranked by your requirements and then by the longest time with power or your priorities; across several sites, each time is judged by the site that does worst.

- See dates at a glance: Explore’s year view colours every landing day of the next 12 months at one site, and the planner’s “Ranking and dates” gives the best landing in each month at its first three sites. Open a day or a cell to see that forecast.

- Try a different lander: choose an example or change the panel, battery and electricity use, and the height of the mast the hills are seen from.

- Ask in plain words: the assistant can select sites or change settings for you. The calculation engine supplies the numbers, not the AI.

- Share: a link with every setting and the ranking, the figures as files to download, and a one-page brief; Compare’s scenarios have a link and a brief of their own.

- Check the evidence: on the Accuracy page three of four checks meet their criteria: the directions to the Sun and Earth against JPL Horizons, sunlight and Earth in view against NASA’s LOLA maps, and the power sums. The fourth, where shadows fall in 20 pictures from NASA’s lunar orbiter, misses its own mark: 3 of the pictures fall short, all taken with the Sun 1.1° up or less. Past missions’ endings are shown as context, not as a check.

The home page introduces the project with a flight to the south pole. Moon and Earth imagery use NASA’s CGI Moon Kit and Blue Marble. Large terrain shapes come from data; decorative rocks and small craters are illustrations. Forecasts work offline when the app and data are stored locally. Live AI and the live Horizons check need internet.

## A few terms you will see

CLPS: NASA’s Commercial Lunar Payload Services, which buys deliveries to the Moon from companies. Terrain: the shape of the ground. Horizon: the skyline around you. Elevation: how high the Sun or Earth appears above the local horizontal. Ephemeris: positions in space over time. UTC: the shared time standard used for arrivals. W measures power; Wh or kWh measures stored energy.

Sources: [NASA LRO/LOLA](https://science.nasa.gov/mission/lro/lola/) | [JPL DE440](https://ssd.jpl.nasa.gov/planets/eph_export.html) | [JPL Horizons](https://ssd.jpl.nasa.gov/horizons/) | [LOLA sunlight maps](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/)

Built by Team Astroy/Ed for NASA Space Apps 2026. Earthrise uses NASA data but is not an official NASA product. It helps with early comparisons and learning; it is not a complete mission safety check.
