# Elbow Room

**Before you buy the couch, find out whether it can get up the stairs.**

Every room planner ever built answers one question: does it fit in the room. None of them answer the question that actually costs you money: can it get *there*. Through the front door, round the newel post, up the stairs, and around the turn at the top.

I learned this the expensive way. I own a 1970s house whose basement stairs turn at an angle. The listing sheet gives every room in the house down to the inch and says nothing at all about that turn. A long couch went down those stairs and could not come back up without taking the wall with it. Different day, different object: the crew swapping the water heater after a flood carried a 279 litre tank down the same stairs with no wall protection, and left their own mark next to it.

The measurement that decides both of those outcomes appears on no listing, no floor plan, and no furniture product page.

## What it does

Elbow Room is a canvas floor and route planner that you and your agent operate together. You draw the real space. Your agent runs the geometry: whether a given object can travel from the truck to the room, at what orientation, with what clearance to spare, and which specific measurement is the one that stops it.

When the answer depends on taste or on a tradeoff only you can make (take the door off its hinges, unbolt the feet, or go through the window), the app hands the pen back to you mid-task rather than guessing.

## Why WebMCP

A canvas has no DOM. There are no semantic targets to click and no accessible tree to read, so a browser agent driving the screen has to hit raw coordinates on a surface it cannot interpret. This class of app is effectively invisible to every browser agent that exists today.

WebMCP is the first mechanism that lets an agent operate a spatial editor properly, by calling the app's own typed geometry rather than by guessing at pixels. This project is a test of that claim, measured rather than asserted.

## Status

In active development for [The WebMCP Challenge](https://webmcp.devpost.com/). Submissions close 3 September 2026. Started from nothing after the submission period opened on 25 August 2026, so everything here is new work.

Measured results are not in yet. They will be published here when the benchmark run is done, whatever they say.

## Licence

Apache-2.0. See [LICENSE](LICENSE).
