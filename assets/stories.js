/* Editorial summaries of the selected model outputs, aligned to source frames.
 * Steps are independent of the media clock: several steps share a frozen frame. */
window.FLOORSAV_STORIES = [
  {
    name: "region",
    category: "Regional reasoning",
    title: "You hear them. But where are they?",
    start: 96,
    duration: 32,
    query: 18.75,
    event: [18.5, 21.5],
    quote: "I mean, I like beef rare.",
    qa: "expE_0034",
    scene: "loc2_script3_seq4_rec1",
    figure: "regional",
    question:
      "When <mark>“I mean, I like beef rare”</mark> is spoken, which area is the other person in?",
    baseline: "Dining area",
    answer: "Kitchen area",
    takeaway: "Movement history + object landmarks → the speaker’s area.",
    caveat:
      "The kitchen outline is a reading aid. The model receives object labels, not annotated room boundaries. Sound estimates can be noisy; the explanation also uses movement history.",
    steps: [
      {
        holdSeconds: 6,
        at: 6,
        from: 2,
        until: 6,
        name: "Watch them leave",
        action: "Watch the departure",
        focus: "Video → movement history",
        insight:
          "The other person <strong>leaves the dining table</strong>. The camera wearer stays behind. Keep those two locations separate.",
        video: "The other person leaves the frame.",
        map: "The camera stays by the dining table.",
      },
      {
        holdSeconds: 6,
        at: 18.75,
        from: 17.5,
        until: 21.5,
        name: "Freeze the question",
        action: "Watch the speech event",
        focus: "Audio → the right moment",
        insight:
          "Now the speaker is <strong>off-screen</strong>. The meal in view tells us where the camera wearer is—not where the speaker is.",
        video: "Speech is heard; the speaker is out of view.",
        map: "1 · Camera position at the dining table.",
      },
      {
        holdSeconds: 8,
        at: 18.75,
        name: "Read the place",
        focus: "Map → object landmarks",
        insight:
          "The <strong>counter, oven, and refrigerator</strong> identify the kitchen. The model connects these landmarks with the person’s earlier movement.",
        video: "Same question moment. The speaker remains unseen.",
        map: "2 · Kitchen landmarks, away from the dining table.",
      },
      {
        holdSeconds: 8,
        at: 18.75,
        name: "Connect the evidence",
        focus: "Video + map → answer",
        insight:
          "The person left the table and went toward the kitchen. FloorSAV combines that <strong>history with the mapped landmarks</strong> to answer “kitchen area.”",
        video: "The visible dining table is the baseline’s mistaken cue.",
        map: "2 · Kitchen area is identified from its objects.",
      },
    ],
  },
  {
    name: "path",
    category: "Path reasoning",
    title: "What would you pass on the way?",
    start: 118,
    duration: 16,
    query: 5.6,
    event: [4.5, 6.8],
    quote: "Let’s … we got the kebabs so.",
    qa: "expE_1224",
    scene: "loc2_script3_seq31_rec1",
    figure: "path",
    question:
      "At <mark>“Let’s … we got the kebabs so,”</mark> imagine walking straight to the couch. Which candidate object would you pass most closely?",
    baseline: "Pool window",
    answer: "Wall-mounted TV",
    takeaway: "A shared map makes an imagined route explicit.",
    caveat:
      "The route illustrates estimated map positions. The selected answer matches ground truth, but the model’s distance calculations are imperfect. An independent ground-truth check gives 1.04 m to the TV and 2.70 m to the window, including the route’s endpoints.",
    steps: [
      {
        holdSeconds: 6,
        at: 5.6,
        from: 0,
        until: 6.8,
        name: "Freeze your position",
        action: "Watch the question moment",
        focus: "Audio + video → starting point",
        insight:
          "First locate the speech event. Freeze both views here: <strong>this camera position starts the imagined walk</strong>. The person does not actually walk the route in this clip.",
        video: "In the kitchen at the question moment.",
        map: "1 · The route starts at this camera position.",
      },
      {
        holdSeconds: 8,
        at: 5.6,
        name: "Find the destination",
        focus: "Map → a place beyond the view",
        insight:
          "The couch is labeled <strong>“sofa” on the map</strong>. Both the starting point and destination are visible in one coordinate frame, even though the couch is outside this camera view.",
        video: "The current camera view does not show the couch.",
        map: "1 · Start. 2 · Couch, labeled “sofa”.",
      },
      {
        holdSeconds: 6,
        at: 5.6,
        name: "Draw the route",
        focus: "Geometry → the imagined path",
        insight:
          "Connect the start and couch with a <strong>straight segment</strong>. The blue line is the question’s imagined route, not a recorded trajectory.",
        video: "Still frozen at the same moment.",
        map: "The blue segment connects 1 → 2.",
      },
      {
        holdSeconds: 8,
        at: 5.6,
        name: "Compare nearby objects",
        focus: "Map + question → answer",
        insight:
          "FloorSAV selects the <strong>wall-mounted TV</strong> along the route. Its answer matches ground truth; the numerical explanation has estimation errors.",
        video: "Video provides the event; the map provides the layout.",
        map: "3 · TV beside the imagined route.",
      },
    ],
  },
  {
    name: "viewpoint",
    category: "Dynamic relativity",
    title: "Their viewpoint. Your answer.",
    start: 60,
    duration: 20,
    query: 5.5,
    event: [5, 6.5],
    quote: "We have this thing.",
    qa: "expE_1567",
    scene: "loc3_script2_seq3_rec1",
    figure: "cross-agent",
    question:
      "At <mark>“We have this thing,”</mark> imagine the other person faces you. Put an object 3 m away, 70° clockwise from their heading. Where is it relative to you?",
    baseline: "Front-left",
    answer: "Back-left",
    takeaway: "One coordinate frame connects two different viewpoints.",
    caveat:
      "The coordinate sketch reconstructs the model’s reported estimates; it is not a ground-truth overlay. Its position estimates are approximate. The final back-left answer matches ground truth.",
    steps: [
      {
        holdSeconds: 6,
        at: 5.5,
        from: 0,
        until: 6.5,
        name: "Freeze the question",
        action: "Watch the camera turn",
        focus: "Video → a changing viewpoint",
        insight:
          "The camera turns away before the speech event. <strong>What is in front of the camera changes</strong>, so assuming the other person is straight ahead can give the wrong answer.",
        video: "The other person is outside this query-time view.",
        map: "1 · The camera’s position and facing direction.",
      },
      {
        holdSeconds: 6,
        at: 5.5,
        name: "Use a shared frame",
        focus: "Both views → estimated positions",
        insight:
          "FloorSAV uses the map and visual context to estimate <strong>both people’s positions</strong>. A shared coordinate frame lets it relate the two viewpoints.",
        video: "The video stays frozen while we inspect the geometry.",
        map: "Model coordinate sketch: 1 · You. 2 · Other person.",
      },
      {
        holdSeconds: 8,
        at: 5.5,
        name: "Place the imagined object",
        focus: "Question → a geometric construction",
        insight:
          "Face the other person toward you, then turn that heading <strong>70° clockwise</strong> and extend it <strong>3 m</strong>. This places the imagined object in the shared frame.",
        video: "No object appears in the footage—it is hypothetical.",
        map: "2 → 3 · Rotate the heading and place the object.",
      },
      {
        holdSeconds: 8,
        at: 5.5,
        name: "Read it from your view",
        focus: "Shared frame → your viewpoint",
        insight:
          "Finally, compare the object’s position with <strong>your own facing direction</strong>. In the model’s reconstruction, the object lies behind you and to your left: “back-left.”",
        video: "The answer is relative to the camera wearer.",
        map: "3 · The object falls in your back-left quadrant.",
      },
    ],
  },
];
