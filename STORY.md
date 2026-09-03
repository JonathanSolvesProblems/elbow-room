## Inspiration

Last year I bought a couch that would not go down my basement stairs.

The flight turns ninety degrees partway down, on three pie shaped steps with no landing and nowhere to stand the thing up and swing it. I found out halfway, with the couch wedged and the wall already gouged. It came out in the end and it took some of the plaster with it.

Then it happened to somebody else. A flood forced a water heater replacement, and two installers brought a 279 litre tank down the same stairs. They put nothing on the walls first. The gouges along the soffit edge are theirs, not the couch's.

Two objects, one staircase, and nobody measured it either time. There was nowhere to look it up. The property listing gives all thirteen rooms to the inch and says nothing at all about the stairs. The one measurement that decides whether your furniture can get into the house appears on no listing anywhere.

Every room planner ever built answers *does it fit in the room*. I wanted the question that actually costs people money and plaster: **can it even get there.**

## What it does

You pick something you are thinking of buying and it tells you whether it can physically travel up the staircase, through the door, along the run and around the turn, choosing the best orientation and tilt for you. Then it tells you which stage fails and by how much.

For my couch that is **3 foot 9 and a half too long at the winder turn**. That is the number you take shopping.

You can measure your own place. Drop a photo or a video off your phone, click four corners of something whose real size you know, and every pixel on that surface becomes inches. Click round where the walls meet the floor and you get a room in plan and in three dimensions, with your own photograph on the floor.

And a furniture shop on a completely different website can ask your staircase directly, get a real answer back, and never learn a single one of your measurements.

## Why WebMCP fits this, and what it unlocks

This app is a canvas. To an agent reading the page, the whole product is one `<canvas>` element with no children, no text and three attributes. I measured what that costs rather than guessing: across eight questions about the current state, the accessibility tree answers seven and the tools answer eight. Across seven actions, only three have a DOM control an agent could click at all, and the tools do all seven. Scraping gets you most of the reading. It gets you almost none of the doing.

So what can a person and an agent now do together that neither could before?

**Operate a spatial editor by talking.** Ask "can my couch get up these stairs", then "show me where it jams", and the couch moves on the screen you are watching. No coordinates, no dragging, and nothing described back to you second hand.

**Let a shop ask your house a question.** A furniture site on another domain gets a real verdict about your staircase and never learns a measurement. That exchange has no API, no SDK and no account behind it. It works because both origins opted in.

**Keep the person in charge of what matters.** The agent can move things freely, but a tape reading changes every verdict the app gives, so that one stops and asks first.

## How I built it

Vanilla JavaScript. No build step, no bundler, no framework, no backend. Everything runs in the tab.

**The tools.** Fifteen of them on `document.modelContext`. The important thing is that they are not an agent-only API bolted onto the side. `check_fit`, `show_pinch`, `select_object` and the rest call exactly the same functions my buttons call. There is one couch and one code path, so when the agent moves the couch it moves on the screen you are watching. That is the whole reason this project exists as a WebMCP demo rather than a chatbot.

**Tools that come and go.** Two remedies, `try_without_feet` and `how_short_to_fit`, are registered through an `AbortController` and only exist while something is actually failing. Switch to a water heater that fits and they unregister themselves, so the agent is never holding options that make no sense for what is on screen.

**The pen goes back to the person.** A tape reading changes every verdict the app gives, so `record_measurement` calls `requestUserInteraction` and then blocks on an in-page confirmation. The agent proposes. I decide.

**One tool crosses an origin boundary.** A fictional furniture shop on its own domain calls `getTools({ fromOrigins })` and reaches exactly one tool, `check_fit`, marked `readOnlyHint` and exposed with `exposedTo`. No API between the two sites, no SDK, no account. It cannot read my measurements and it cannot move anything. Both sides had to say yes.

**The geometry.** The corner is the ladder-around-a-corner problem with the object's width put back in, minimised numerically because a couch is not a thin rod. The photograph maths is a four point homography between the image and the floor plane, plus its inverse so world coordinates can be drawn back onto whichever frame is on screen. The stairwell is extruded in Three.js from the seven figures the model holds.

**The decoder.** Phone video is usually HEVC and most browsers will not touch it, so the page carries a vendored ffmpeg.wasm build and decodes keyframes in the tab. Nothing is uploaded.

## Challenges I ran into

**Making the agent's work visible.** It would have been far easier to give the agent its own code path and let it return text. Everything I wanted from this project depended on refusing that. The tools had to drive the identical functions the buttons drive, which meant the pose, the verdict, the plan and the 3D view all had to be derivable from one state object, and the object had to move on screen before the reply finished. Getting the two drawings to agree with each other and with the sentence in the sidebar took longer than the geometry did.

**HEVC nearly beat me.** Chrome decodes it natively, Edge on my machine does not. The UMD ffmpeg worker resolved against `file://`, blob URLs gave "cannot find module", and module workers cannot call `importScripts` so the UMD core failed there too. The answer was vendoring the ESM build and its ESM core same origin.

**Saying no to the thing everyone asks for.** The obvious request is "stitch the photos into a 3D model of my house." I built the honest version instead. A homography is exact only on the plane it was calibrated against, so the floor can genuinely be warped and stitched into one overhead photograph in real inches, and anything standing up off that floor smears. So the floor is stitched and the walls come from your clicks, and the page says so in three places rather than letting the picture imply otherwise.

**Reporting a feature that does not work.** I wrote automatic frame matching so twelve frames would cost four clicks instead of forty eight. On a plain hallway floor it fails, and I measured why rather than shipping it quietly: the four corners each drift a different way by up to 114 pixels at correlations above 0.9, because a floor looks the same everywhere, and a grid of 47 candidate points across the frame yields only 23 to 42 percent RANSAC inliers. It is still in the app because it costs three seconds and can never produce a bad stitch, and the panel now says out loud when it finds nothing and why.

## Accomplishments that I'm proud of

**It predicted two real outcomes, and both had already happened.** The staircase has history that predates the software. It says the couch does not go, and the couch did not go. It says the Giant 172E-3F8M water heater goes, and it went down. The dimensions came off a tape and off the manufacturer's engineering sheet, not off my guessing. Two for two, n=2, stated plainly. The grader is the plaster.

**The corner solver agrees with a result three hundred years older than it.** The longest thin rod that turns a right angle between corridors of width a and b has a closed form in any calculus textbook. The app does not use that formula. Set the object's width to zero and the two must agree, and across 169 width pairs from 24 to 60 inches they disagree by at most **1.63 millionths of an inch**. On the real staircase they agree to machine precision. One command, no key, and a judge can check the textbook formula in thirty seconds without trusting a line of my code.

**The photograph maths is checked against a camera it never saw.** Verified against a synthetic camera with genuine perspective, distances the calibration never saw come back within four thousandths of an inch.

**Every number says where it came from.** Measured, standard, estimated or provisional, with a note naming the photograph or the manufacturer's sheet. A verdict is never quoted as firmer than its weakest input, and `list_unknowns` exists so an agent can ask before presenting an answer as certain.

## What I learned

Tool budgets change design. Names under thirty characters, descriptions under five hundred, outputs under about fifteen hundred. That is not a formatting constraint, it is a forcing function: it pushed me to make each tool answer one question completely rather than return a blob and hope.

Never make the model do arithmetic. Every tool takes raw inches and does the geometry in the page. The model decides what to ask, not what the answer is.

The hard part was not the geometry. It was deciding what the app must refuse to claim. A warp that is right for the floor is wrong for the walls, one reading out of seven leaves you looking at my staircase and not yours, and a stitched floor smaller than its own reference rectangle means the frames disagree. Each of those is now a thing the page says rather than a thing it hides.

And an agent moving something you can see is a different experience from an agent describing it. That difference is the entire argument for WebMCP over scraping, and it is worth more than any number of tools.

## What's next for Elbow Room

Feature matching with geometric verification, so multiple frames can be pinned without clicking the same four corners on each one. A doorway only mode, because most people's real blocker is a door frame rather than a turn. And a small script a furniture retailer could drop onto a product page, so the "will it get in" answer sits next to the price rather than in a separate tab.
