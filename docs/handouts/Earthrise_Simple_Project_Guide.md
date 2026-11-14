# Meet Earthrise

A simple guide for someone seeing the project for the first time

Earthrise helps people compare places and dates for landing on the Moon. It estimates when a lander has sunlight, how long its electrical power lasts, and when Earth is visible above the surrounding hills.

## Why is this useful?

A lander is a spacecraft that reaches the ground. A solar-powered lander uses sunlight to make electricity and a battery to store it. If the Sun disappears behind a hill, the lander may have to run on its battery.

To send information directly home, it also needs a clear view toward Earth. A useful opportunity requires both electrical power and Earth visibility at the same time.

## Why focus on the south pole?

Near the Moon’s south pole, the Sun stays low in the sky. Hills and crater rims can block it for long periods. Two nearby places can therefore have very different conditions. Changing the landing date can change the result too.

## An everyday example

Imagine a solar garden light behind a wall. The light may be in shadow even while the sky is bright. Now imagine that it must also send a message over another wall before its battery runs out. Earthrise helps explore that kind of timing problem on the Moon.

## Who can use it?

Mission teams can explore early planning options. Teachers and students can learn why lunar missions are difficult. The public can explore the Moon without needing to understand the mathematics.

Earthrise is a team project for NASA Space Apps, under the “CLPS Lunar Mission Browser” challenge. It uses NASA data, but it is not an official NASA product or a flight-approved planning system.

# Choose a plan and compare alternatives

Keep the original plan while exploring what could change

## 1. Choose a landing site

Browse 19 catalogue locations: selected Artemis candidate regions, places where commercial landers touched down, high points and crater floors. A relief map shows where the sites are and the shape of the ground.

Compare every site at the same arrival time, or switch to each site’s best sampled arrival. You can also enter your own coordinates for a point south of 60° south latitude.

## 2. Choose the arrival and the lander

Choose an arrival date and hour in UTC, and look ahead for 14, 30 or 90 days. The position data cover 2024–2036; the full forecast must fit inside that period.

Choose a small, medium or large example lander, or set your own solar panel, panel direction, efficiency, electricity use, battery capacity and starting charge. You can also change the mast height and how far Earth must clear the hills.

## 3. Save separate scenarios in “Plan a landing”

A scenario is one complete “what if?” plan. Save up to six, each with its own site, arrival and lander settings. Editing one does not change the others. The first scenario is the baseline: the reference used to show differences.

The “Landing delayed?” controls keep the original plan, add a later arrival at the same site, and let you add a nearby site on the delayed date. You can edit, remove or choose a different baseline.

## 4. Check what each plan provides

Set the hours of continuous power you need, the minimum hours powered with Earth in view, and the maximum gap with Earth hidden. Each result explains which selected requirements it meets or misses. Missing terrain data makes the assessment unconfirmed.

“Compare sites” also offers a simpler table of up to four sites with the same arrival, duration and lander. It shows sunlight, Earth visibility, their powered overlap, the longest night, the longest Earth-hidden gap and modeled powered duration.

# See what happens, hour by hour

Pictures explain why a plan performs the way it does

## 5. Start with the answer in Explore

Explore gives a plain-language result for one site and arrival. It explains the first loss of power and how much Earth visibility occurs before it. It can suggest another arrival or a nearby place. “All numbers” opens the detailed results and assumptions.

## 6. Follow the chart and the time bar

A chart puts the Sun, Earth and battery on the same timeline. Move the time bar or press Play to follow the forecast hour by hour. Markers in the immersive view identify moments such as the Sun setting behind a hill or the battery running out.

## 7. Look at the ground in three ways

- Shadow map: a view from above showing where sunlight reaches the terrain.

- 3D from above: a three-dimensional view that makes slopes and crater rims easier to understand.

- Horizon chart: the outline of the surrounding hills, with the Sun and Earth shown against it.

“Where on the Moon” places the selected site beside nearby catalogue locations.

## 8. Stand at the site

“Stand on the Moon” shows a view from the landing point, with terrain, shadows, the Sun, Earth and stars. An example lander provides scale. The large terrain shapes come from measured data; nearby decorative rocks and small craters are illustrations. Simpler views are available when advanced graphics are unavailable.

## 9. Explore dates and sensitivity

The date grid compares the selected point and two nearby catalogue points across seven weekly arrivals. Each numbered cell opens that forecast. A separate check compares lower and higher mast heights, keeping the other settings fixed.

A search can also find a better sampled arrival over the next 12 months. It checks six-hour steps, prioritizing continuous powered duration, then Earth visibility while powered. For several compared sites, it prioritizes average powered duration. “Best sampled” is not a guarantee of the best possible mission.

# Get help, share results and understand the limits

The remaining features, and how to read the answers responsibly

## 10. Learn without a technical background

The home page introduces the problem, offers a flight down to the south pole, and provides real places to explore. You can go straight to the delayed-landing comparison. “How it works” uses drawings and simple explanations of sunlight, terrain, Earth visibility and batteries.

## 11. Ask in plain words

On Explore and Compare, type a question such as “Compare these two sites for 14 days.” The assistant changes the same controls a person would use. The calculation engine supplies the physics; the AI does not calculate it. Replies identify whether they came from a live model, a phrase match or a rehearsed answer.

## 12. Save, share and print

The planner saves scenarios in your browser when local storage is available. Share a full comparison link or a single-forecast link with the lander settings preserved. Print a comparison with its assumptions, or open the one-page brief for the selected Explore forecast. The brief can also offer a generated explanation checked against the app’s figures.

## 13. Check the evidence

The Accuracy page compares Sun and Earth directions with JPL Horizons and sunlight estimates with a published LOLA illumination map. It also places predicted sunsets beside real mission endings as examples. You can inspect the tables and request a live Horizons re-check when online. These checks do not prove every part of a mission prediction.

## 14. Use it on different devices

The interface adapts to phones and computers and offers light and dark themes. Physical forecasts can run without Wi-Fi when the application and required data are already available locally. Live AI and live Horizons checks need an internet connection.

Important limits: “Earth in view” does not guarantee a working radio link. The battery model does not predict survival in extreme cold or a successful restart. Events are estimated hourly, and terrain uncertainty can shift them further. Some region coordinates are approximate to about 5 km; a result for one point does not describe an entire region.

# The NASA data behind Earthrise

A dataset is simply an organized collection of measurements or information

## LRO / LOLA terrain maps

NASA’s Lunar Reconnaissance Orbiter (LRO) carries the Lunar Orbiter Laser Altimeter (LOLA). Its measurements help map surface heights. Earthrise uses height grids to work out which hills block the Sun or Earth and to show the ground in 3D. These grids are called Digital Elevation Models, or DEMs.

[NASA: LRO / LOLA](https://science.nasa.gov/mission/lro/lola/)

## JPL DE440 position data and SPICE

NASA’s Jet Propulsion Laboratory (JPL) provides DE440, a model of the positions of the Moon and other solar-system bodies over time. This kind of information is called an ephemeris. The project uses SPICE, NASA’s geometry toolkit, to prepare the Sun and Earth positions used in its forecasts.

[JPL: planetary and lunar ephemerides](https://ssd.jpl.nasa.gov/planets/eph_export.html)

## JPL Horizons and LOLA illumination maps

Horizons provides a reference for checking calculated sky directions. Published LOLA illumination maps provide a separate comparison for how often sites receive sunlight. Different map resolutions, observer heights and time periods can produce different results.

[JPL: Horizons](https://ssd.jpl.nasa.gov/horizons/)

[NASA PDS archive: LOLA illumination maps](https://pds-geosciences.wustl.edu/lro/lro-l-lola-3-rdr-v1/lrolol_1xxx/extras/illumination/)

## Images, stars and real locations

NASA’s CGI Moon Kit supplies Moon imagery and height information for the globe. NASA Blue Marble images provide Earth’s appearance. A Yale star catalogue, accessed through NASA HEASARC, supplies star positions. NASA mission information and other cited sources supply the catalogue of example landing locations.

[NASA: CGI Moon Kit](https://svs.gsfc.nasa.gov/4720/)

## How the information becomes an answer

Earthrise combines where the Sun and Earth are, what terrain surrounds the site, and the selected lander settings. It then estimates sunlight, geometric Earth visibility and the battery’s charge over time. The images help explain these estimates; they are not live camera views from the Moon.

# A short plain-English glossary

Useful words you will see in the project

**CLPS** — Commercial Lunar Payload Services: NASA’s initiative for buying deliveries of science and technology to the Moon from commercial companies.

**Artemis** — NASA’s lunar exploration program. The app includes points representing selected candidate landing regions; it does not certify a landing location.

**Lander / payload** — A lander is a spacecraft that reaches the surface. A payload is equipment or an experiment carried by the spacecraft.

**Coordinates** — A location written using latitude and longitude. Latitude says how far north or south; longitude says how far around the Moon.

**Terrain / topography** — The shape and height of the ground, including hills, slopes, crater rims and floors.

**Horizon / horizon mask** — The skyline seen from a point. A horizon mask records how high the surrounding ground appears in each direction.

**Elevation / azimuth** — For a sky object, elevation is its angle above the local horizontal; azimuth is its direction around the horizon. These are angles, not distances.

**Illumination** — Sunlight reaching a place. Partial sunlight does not necessarily provide enough electricity for the lander.

**Direct-to-Earth / line of sight** — A direct path toward Earth without a relay satellite. Terrain can block that path. Visibility alone does not prove a radio link will work.

**Libration** — The apparent wobble that changes Earth’s position in the lunar sky over time.

**Ephemeris** — A table or model that tells us where objects in space are at different times.

**Watt (W) / watt-hour (Wh)** — Watts measure how quickly equipment uses or produces electricity. Watt-hours measure stored energy. In an ideal example, 200 Wh can supply 100 W for two hours.

**State of charge / brownout** — State of charge is how full the battery is. A brownout here means the modeled supply cannot cover the selected electricity use.

**UTC** — A common world time standard. Using UTC keeps arrival times consistent for people in different countries.

**Scenario / baseline / sensitivity** — A scenario is one saved plan. The baseline is the reference plan. A sensitivity check asks how an answer changes when one assumption changes.

A simple first visit: choose a site → set the UTC arrival and lander → read Explore → compare a delayed arrival → look at the horizon → share the result with its assumptions.
