# Design review with Astra (Codex gpt-6-astra), 2026-09-28

Three rounds: a clean problem statement (no preconceptions), then our design and data, then pushback. Summary and adopted plan in agents/audio.md.

## Round 1 prompt

# Design problem: hearing a child's piano playing on an iPad

I'd like your independent take on the architecture and system design for the
problem below. Please reason from first principles; I'm deliberately not
telling you what has been tried yet. Be concrete and opinionated: what would
you build, what would you expect to work, what would you avoid, and how would
you know it works.

## The product

A web app (vanilla JS, no build step, static hosting on GitHub Pages) that a
5-year-old uses on an iPad to practice on the family's acoustic upright piano.
The app listens through a microphone and turns what it hears into note events
that drive the practice experience:

- **Guided tasks** (most usage): the app shows a short piece (e.g. "C D E F G
  G G G F E D C C C", later both hands: right hand C4-G4, left hand C3-G3, one
  note at a time). It waits for the next expected note; when she plays it, the
  piece advances. Wrong notes are shown but don't advance.
- **Free play / composing**: she plays whatever; the app places each note she
  plays (with its pitch) as a block in a little composition.
- **Call and response**: the app plays a short phrase, she copies it.
- Rhythm matters somewhat (some tasks score timing), pitch matters most.

What matters for her learning (from the pedagogy side): when she plays the
expected note, it should register on the first strike nearly every time
(target >= 95%). Missing a correct note is much worse than wrongly accepting a
note: a miss teaches her to mash the key repeatedly; a false accept costs
little because a parent is watching. In free play, false notes (phantom
blocks) and wrong pitches are visible and annoying.

## The environment

- Acoustic upright piano, somewhat out of tune in places (some keys read tens
  of cents sharp, and it may drift). A home living room: adults talking, a
  2-year-old sibling who bangs keys, the 5-year-old herself talks and sings.
- Microphone: the iPad's built-in mic, iPad resting on the piano's music desk
  (so mechanical noise from keys and the action is conducted through the wood).
  An external USB mic is possible but adds a stand and a cable near small kids.
- She plays like a beginner: soft uneven pokes, repeated mashing of one key,
  occasionally two adjacent keys at once, holding keys, sometimes very fast
  repeats, rarely the pedal.
- Latency: feedback within ~50-100 ms feels fine; the note's time stamp must
  be accurate (tens of ms) for rhythm scoring even if the notification is later.

## Platform constraints

- iPad Safari (iPadOS 26), usually a home-screen web app. Web Audio with an
  AudioWorklet is available; WebAssembly (SIMD) and WebGPU exist; the page is
  statically hosted, so cross-origin isolation (needed for threaded WASM /
  SharedArrayBuffer) would need a service-worker trick. iOS Safari lets the
  page turn off echo cancellation; no other mic processing controls are
  exposed. A native app is possible but costs distribution simplicity
  (currently: push to main = deployed to her iPad in minutes).
- Old app versions stay live at permanent URLs; the audio/detector code can be
  swapped under old UIs, but infinite backward compatibility isn't required.
- The app knows, in guided tasks, exactly which note it expects next.

## Resources

- Compute: a home Linux box with a 12 GB NVIDIA TITAN Xp (Pascal, ~9 TFLOPS
  FP32), 40 CPU threads, ~75 GB free disk; a MacBook (M4 Pro); access to a
  single very large datacenter GPU (GB300-class) for a few hours, run by hand.
- Money: ~$100 if clearly worth it.
- Data: every practice session logs detector events, and (opt-in) the
  session's audio is recorded and uploaded: currently ~2 hours of real audio
  from her piano through that iPad, unlabeled. Public datasets and pretrained
  offline transcription models (MAESTRO; Onsets&Frames / Kong et al. /
  Transkun / hFT-Transformer / MT3-family) are available.
- People: one parent, willing to do some dedicated recording sessions (e.g.
  "play exactly this", "sample every key") and a bounded amount of labeling
  by ear (tens of minutes, not hours). Nobody will label hours of audio.
- An engineer (an AI agent) who can write and run code, train models on the
  home GPU, and ship to the app.

## What I'd like from you

1. The architecture you'd build for the note detector (and its interface to
   the app), including what runs in the browser and what's learned offline.
2. How you'd get training and evaluation data given the labeling budget.
3. How you'd use the "app knows the expected note" fact, if at all.
4. The evaluation methodology you'd trust, and the traps you'd watch for.
5. Your biggest risks and what you'd try first in the next week.

## Round 1: Astra

I would build an **onset-driven, piano-specific detector with two decision policies: forgiving guided practice and conservative free play**. I would start with calibrated signal processing, collect a small amount of deliberately structured data, and add a small learned model where measurements show it is needed. I would not start by fine-tuning a large transcription model.

The central problem is recognizing a *new key strike* amid ringing strings, speech, and mechanical noise. Estimating the dominant pitch in each audio frame is insufficient: the loudest component may be an overtone, the previous note may still dominate, and striking the same key twice need not produce a clean silence between strikes.

**What I would build**

The browser would have a continuous audio front end, an onset/pitch evidence layer, and an application policy layer. Those boundaries matter: the UI should not have to understand FFT bins or model logits, and changing the expected note should not reset the audio analysis.

An AudioWorklet would capture mono PCM into a bounded ring buffer, attach audio sample indices, and send small batches to a worker. The worker would do spectral analysis and inference. I would begin with ordinary transferable buffers and single-threaded JavaScript or WASM; this workload does not inherently require SharedArrayBuffer, threaded WASM, or WebGPU. Keep allocations and inference out of the audio callback, and bound the queue so a temporary slowdown cannot turn into seconds of stale feedback.

I would disable echo cancellation, verify what settings Safari actually applies, and measure performance on the actual iPad. I would assume remaining gain control or other processing can change amplitude and timbre. Absolute amplitude thresholds would consequently play only a limited role.

The front end would use overlapping, multiresolution spectral windows: short windows for attack timing and longer windows for pitch evidence. As a starting point, I would use a roughly 5–10 ms analysis hop, with windows around 20–30 ms and 60–90 ms. These are parameters to measure, not a guarantee of 60 ms decisions. C3 has a period of about 7.6 ms, and soft attacks need enough subsequent sound to become identifiable.

For the initial detector, I would build a small dictionary of **recorded templates from this piano through this iPad**, including attack and early decay spectra at several playing strengths. Fit combinations of those templates to recent spectral energy, allowing modest frequency shifts and differences in spectral balance. Include a background/residual component so the fit is allowed to say “none of these notes.” Do not force every sound into the nearest piano key.

This exploits a major advantage of the problem: it is one instrument, in a fairly repeatable position, initially over a narrow range. Start with the practice range, but include surrounding pitches and octave confusers. A detector that only knows C3–G4 will confidently mislabel notes played elsewhere by the sibling.

Onsets would come from positive spectral changes, ideally weighted toward the partials of candidate pitches. Pitch decisions would use both that change and the subsequent spectrum. The output must support two concurrent notes; even if the lesson is monophonic, the child is not reliably monophonic.

Repeated notes deserve their own treatment. A fresh attack in a ringing note’s partials can be a new strike even though its pitch activity never falls to zero. I would avoid a long global cooldown and avoid requiring silence before retriggering. Use short duplicate suppression around one attack, together with evidence of renewed excitation, and explicitly test the fastest repeats she actually produces.

Once this baseline is measured, my likely learned replacement would be a small causal convolutional model over log-spectral features, producing per-pitch onset scores and a separate piano-attack score. It would see a few hundred milliseconds of history and use a deliberately bounded amount of evidence after the onset. I would train it offline and benchmark it in a browser worker before investing in optimization. The TITAN Xp should be sufficient for a model of this scale; the large GPU is optional teacher-inference capacity, not a prerequisite.

The detector’s interface would expose candidate attacks with an ID, estimated onset sample/time, decision time, pitch alternatives, strength, and confidence scores. The policy layer would produce committed note events. I would distinguish scores from calibrated probabilities unless calibration has actually been checked.

For composition, delay commitment briefly rather than placing a block immediately and then changing its pitch. For guided tasks, commit as soon as the task-specific criterion is met. Note offsets can be approximate initially: with an acoustic piano, audible decay is not a reliable measurement of when the finger releases the key.

**How I would use the expected note**

I would use it aggressively, but only in the decision policy.

Guided practice is asking, “Was this new attack plausibly the requested note?” Free play asks, “Which notes were played?” Those deserve different thresholds. A general transcription threshold is likely to miss soft correct strikes; a guided-practice threshold will make too many phantom composition blocks.

For each candidate attack, retain unconditional evidence for several pitches. Then test the expected pitch using a lower acceptance threshold, calibrated against confusers. An expected pitch that is reasonably supported can advance the lesson even if another candidate is slightly stronger. Strong evidence for an unrelated note should usually produce a wrong-note indication. Weak or ambiguous evidence need not produce either a wrong-note accusation or an advancement.

Crucially, **the expected note cannot manufacture an onset**. Otherwise ringing audio, speech, or changing the expected note can advance the piece without a new strike. Every advancement must consume one distinct attack ID. Four consecutive Gs require four attacks; one G with a long decay cannot satisfy all four.

I would generally accept an attack containing the expected pitch plus an accidental neighbor in early guided lessons, while retaining the extra pitch in the event record. That matches your stated learning priorities. It should be a deliberate pedagogical policy, not an accidental side effect of poor polyphonic detection.

Wrong-note displays should themselves require reasonable confidence. A child should not see a cascade of accusations because the microphone heard an uncertain rattle.

For call and response, I would initially separate playback and listening. Keep analysis running if useful, but prohibit player-event commitment during app playback and use a measured decay guard afterward. Known playback timing does not remove room reverberation. Supporting the child playing over the app’s sound is a separate echo-separation problem that I would postpone.

**Data I would collect**

The two hours of existing audio are valuable for discovering failures and sampling realistic backgrounds. They are not ground truth merely because detector events or lesson targets accompany them. The expected note can be wrong, and the existing detector has selectively logged what it could recognize.

I would first organize a short parent recording session:

- Play the practice pitches, surrounding notes, and octave confusers individually, at soft, medium, and stronger levels.
- Record same-note repeats, alternating notes, legato transitions, held notes followed by new notes, and adjacent two-note accidents.
- Record speech, singing, action noise, touching the iPad, and household sounds without intentional piano notes.
- Repeat a smaller subset on another day and after slightly repositioning the iPad.

A paced recording script can establish intended pitch and trial boundaries without hand-labeling every sample. It should cue visually, record multiple strikes per pitch, and leave generous gaps between trials. Those labels still need spot checks: a prompt is evidence of what was requested, not proof of what was played. A synchronized close view of the keyboard can make questionable trials much faster to resolve.

These recordings provide piano templates, tuning estimates, clean training examples, and controlled tests. Parent strikes will not reproduce all of the child’s attacks, so I would reserve some labeling budget for actual practice.

I would spend the remaining budget on two kinds of short excerpts: a random sample of real sessions, and an enriched sample of suspected failures. Run an offline transcription model and compare it with the browser detector to find disagreements, low-confidence regions, possible repeats, and speech-related events. Manually correct short excerpts rather than reviewing continuous hours. Preserve a separately sampled random test set so the disagreement mining does not define the apparent error rate.

Offline transcription models are useful annotators’ assistants and weak-label generators. Their consensus is not truth: they can share errors on quiet notes, repeated strikes, and unusual microphone audio. I would use teacher predictions cautiously for training and manually verify evaluation labels.

For augmentation, mix locally recorded isolated notes and background audio with varied overlap, levels, modest pitch shifts, and spectral coloration. This cheaply teaches residual ringing and common mixtures. It will not fully reproduce real simultaneous piano strikes or changing microphone gain, so real mixtures remain necessary.

I would save the large GPU session until there is a specific batch job worth running. Acquiring clean local examples and a trustworthy test set is more valuable than launching an ambitious training run immediately.

**How I would decide whether it works**

I would evaluate the detector and the lesson state machine separately.

For guided tasks, the principal metric would be: **among independently verified correct first strikes while the app is waiting for that note, what fraction advance within the allowed feedback window?** Also report false advancements during wrong-note attacks and during no-play intervals. A system can achieve excellent recall simply by advancing on nearly everything, so both constraints must be visible.

For free play, measure onset/pitch precision and recall, duplicate events per real strike, and phantom blocks per minute. Separate silence, speech, sustained notes, and active playing. An overall F1 score can conceal exactly the behavior that makes a composition tool annoying.

For rhythm, report onset timestamp error independently from notification delay. Timestamp an event back at its estimated attack rather than when the classifier becomes confident. Audio sample time gives stable relative timing, but it does not automatically account for microphone input latency or align to audible app playback. For absolute call-and-response scoring, measure that relationship on the device. Initially I would score relative intervals generously.

Split data by recording session or day, not by adjacent audio windows. Keep all augmented versions of a source recording in the same split. Calibration recordings can deliberately be available to the detector, but evaluation should use new performances and conditions. Freeze a final test set before threshold tuning.

Report results separately for soft notes, repeats, left-hand pitches, speech overlap, adjacent keys, and iPad placement. To substantiate 95% recall, I would want hundreds of relevant strikes across multiple sessions, with uncertainty estimates and per-session results. A pooled 95% can still hide a disastrous soft-note or repeated-note failure mode.

Finally, replay recorded PCM through the actual browser implementation, including its state machine, then do live iPad tests. Offline model accuracy does not reveal dropped buffers, worker backlogs, Safari interruptions, or duplicate advancements.

**The next week**

I would spend the first two days establishing reliable capture, timestamps, replay, and a small verified evaluation set. Then I would collect the structured piano samples and build the template/onset baseline. By the end of the week, I would compare guided and free-play policies on held-out recordings and a live practice session, with an explicit error inventory.

My biggest risks are soft repeated strikes buried under their own decay, octave mistakes from strong overtones, and speech or mechanical transients triggering note events. There is also an irreducible limitation: one microphone cannot tell which child struck a key. If the sibling plays the expected note, an audio-only detector will reasonably accept it.

Before buying a microphone, I would test small placement changes and safe vibration isolation under the iPad. Those could materially improve the signal at essentially no cost. If recording comparisons show the built-in placement is the dominant limitation, an external mic becomes a justified purchase.

I expect guided practice over a limited range to work substantially better than unrestricted free transcription. I would ship that useful operating point first, with conservative free play, and train the small model against measured shortcomings. The first milestone is that her ordinary soft C, and her next repeated C, both register once on the first strike across several real practice sessions.
## Round 2 prompt (piano-audio)

Thanks, that's a strong answer. Now the reveal: here is what was actually built over the last three days and what the data said. I'd like you to critique it hard, tell me where you'd change course, and push back on my own positions below where you think I'm wrong.

## What exists today (in production)

- AudioWorklet does everything in-thread (no worker): 48 kHz, 128-sample hops.
- "Classic" path: onsets from log spectral flux + an energy-rise test with adaptive thresholds (mean + K·std of recent values), then pitch from McLeod autocorrelation (NSDF) on a ~21 ms window starting 1.3 ms after the onset, 43 ms fallback window. Monophonic.
- "Network" path (current default): a tiny causal MLP (4 log-frequency frames at 3 bins/semitone, 216 bins, 2048-pt FFT every 256 samples -> 128 ReLU -> 52 keys A2..C7), int8 weights, ~3% CPU. Trained on ~25 min of her real recordings with labels from Kong et al.'s offline transcriber (pseudo-labels). It supplies onsets above A3; pitch still comes from the NSDF step. Below A3 the classic path owns notes (the net had seen too few low notes).
- Patches, each justified by data: per-key tuning offsets (this piano's F4 reads +50..75 cents sharp in the first ~25 ms after the strike, and drifted day to day; steady-state it's only +13); an "octave-down" rule for C4 (its fundamental is ~15 dB below its 2nd harmonic here, so NSDF picked C5); a speech filter (pitch drift over the first 45 ms > 40 cents below C4 => "voice"); duplicate suppression between paths; a fallback that accepts a classic reading above A3 when the network registered nothing, *if the onset is loud (>= -50 dBFS RMS over 40 ms) and clarity >= 0.65*; and `expect(midis)`: readings of the expected letter skip the speech filter and are accepted at lower clarity. (An earlier version let the network hunt for the expected key at a low threshold; it created many false notes because it fired repeatedly on a key that was still ringing. You predicted exactly that.)

## What the data said

- The only true labels: (a) the parent's "calibration takes" (prompted, e.g. "play G softly 5 times", 84 notes, clean adult playing), (b) 61 moments from her real sessions that the parent labeled by ear, *selected where the classic detector, the network and Kong disagreed* (so: an enriched disagreement sample, not a random one — your point about random vs enriched samples lands), (c) the parent playing homework pieces as written (70 notes).
- Calibration takes (right / missed / extra of 84): classic 59/25/25; network 72/12/9; network+fallback 73/11/11.
- Labeled disagreement moments: notes only the classic path heard: 0/8 real (quiet key/action noise). Only the network: 1/8 real. Classic+Kong heard it, network silent: 8/8 real (her repeated loud D4s/C4s: the network had learned Kong's blind spot for re-strikes). Network+Kong, classic silent: 7/8 real. Pitch disagreements: network right 6/8, classic 3/8.
- The classic path's biggest failure: on this mic placement it fires 30-250 ms *before* the string sounds, on finger/key/action noise conducted through the case, reads the still-ringing previous note (often the same key in repeated-note passages) as a "note", then fires again on the real strike. A "tone rise" test (the detected pitch must get >= 6 dB louder at the onset) separates these on clean takes, but applied globally it lost 6 of 29 real labeled notes from her playing (her mashing re-strikes a ringing key with little rise).
- Templates: per-key NMF templates from Kong-labeled isolated notes (+4 background templates), 5 warm-started KL iterations per frame, onset = rise in a key's activation. On held-out recordings it matched the classic detector at its operating point and beat simply lowering classic thresholds at high recall, but the tiny MLP beat it.
- Placement: iPad on the piano vs an external USB mic (Shure MV88+) on a stand above the closed lid: similar note-to-room level (~40 dB), fewer pre-attack thumps per note on the stand (0.6-1.0 vs 1.0-2.6), a 120 Hz hum on the USB mic. Only a few takes so far.
- A replay caveat: offline evaluation replays the uploaded AAC recordings through the same JS detector in Node; live results sometimes differ (e.g. more left-hand extras live than in replay).

## My current plan (argue with it)

1. Freeze an eval set: calibration takes + labeled moments + a "messy" prompted set the parent is recording (poking, mashing, re-strikes, two keys at once, held key + new notes, singing along, left hand, splats, placement variants).
2. Auto-label all real recordings with an ensemble of strong offline models (Kong, Transkun v2, maybe YourMT3+); the parent labels only disagreements in small batches.
3. Build a "digital twin" of this piano: the parent samples every key in range at 3 loudnesses (+ repeats, held notes) through the iPad; render unlimited exactly-labeled audio from MIDI (MAESTRO + kid-like patterns: mashing, adjacent-key accidents, holds, uneven timing), mixed with her real background audio; plus free piano sample libraries and room responses for variety.
4. Train a proper polyphonic, causal, Mobile-AMT-style model (MobileNet-ish conv + unidirectional GRU, onset/frame/velocity heads for 88 keys, ~1-6M params) on MAESTRO + twin + her data; use the GB300 hours for a big offline teacher or the full run; distill/fine-tune on the TITAN; run it in the browser (worklet or worker; WASM or hand-written JS) replacing both onset paths, the NSDF pitch step and most of the patches.
5. Expected-note verification for homework on top (evidence for the expected pitch at each real attack, lower threshold; never manufacturing onsets).

Specific questions:
- You'd start from templates/DSP and only add a small learned model later. We already did both, and the small learned model won but failed in a correlated way (inherited teacher blind spots). Given that, is my step 4 the right next investment, or is it premature? What would you do in the next two weeks with these results in hand?
- Is the digital-twin synthetic data plan sound? What will it get wrong?
- The loud-fallback rule uses an absolute -50 dBFS threshold, which you'd distrust. Agree it's fragile; what's the principled replacement?
- The pre-attack mechanical noise problem: fix at the sensor (placement/isolation), in the detector (e.g. require tonal evidence), or in the model (train on it)? All three?
- Worklet vs worker, and WASM/JS vs WebGPU for a ~1-3M param causal model at ~100 frames/s on an iPad: what would you pick?
- What in my plan would you cut?

## Round 2: Astra

The learned model has earned its place. I would stop investing in a general-purpose classic detector or another template system. But **I would not yet commit to the full 88-key, multi-head model and large synthetic training pipeline.** Your strongest evidence points to a deficient onset training target, an unnecessarily brittle pitch stage, and an evaluation mismatch. More capacity may help, but none of those three problems requires it.

The next investment should be a compact learned detector that owns both onset and pitch, trained on verified examples of the failures that matter. Establish an exact live-audio replay path alongside it. Your larger model should be a challenger to that system, not a prerequisite for progress.

**What the results actually establish**

The calibration improvement is substantial: network versus classic goes from 59 to 72 correct notes and cuts extras from 25 to 9. Nevertheless, 72/84 is about 86% recall on clean adult playing. That is far from the product requirement, even before considering the child’s playing. Network plus fallback gains one correct note and adds two extras. That does not justify treating the fallback as a generally successful solution; it could still be useful under the guided-task cost function.

Your disagreement sample is excellent diagnostic material. It cannot establish population performance, and its individual buckets are small. In particular, I would challenge this diagnosis:

> “The network had learned Kong’s blind spot for re-strikes.”

In the cited eight cases, **Kong heard the notes**. Those cases establish that the student failed where the teacher succeeded. Possible causes include insufficient examples, label alignment, target construction, thresholding, inadequate temporal context, or the teacher using future information unavailable to the student. Teacher blind spots elsewhere remain plausible, but this evidence does not identify them as the cause.

Audit the actual training tensors around those eight strikes: waveform, teacher event time, onset target, model output, and final suppression decisions. Closely spaced onset labels can merge through target smoothing; postprocessing can merge distinct peaks; timestamps can be poorly aligned with the causal features. A bigger model will not fix those mistakes.

There is another uncomfortable result: your network apparently supplies better pitch evidence in the disagreement sample, yet production delegates pitch to NSDF. That deserves an immediate ablation. The current system may be discarding its better pitch estimate and then repairing the worse estimate with special cases.

**The next detector I would build**

Keep the current tiny model as a baseline. Train a compact temporal convolutional model—or a modest convolutional model with a small unidirectional GRU—to predict per-key attacks directly. Give it several hundred milliseconds of history, and explicitly budget perhaps 40–70 ms of post-attack evidence. Past context helps distinguish renewed excitation from continuing decay; bounded future evidence helps identify soft attacks.

I would initially cover the supported musical range plus surrounding notes and octave confusers. Add an auxiliary pitch-activity head if it improves attack recognition. Defer velocity estimation. Eighty-eight output keys are not intrinsically expensive, but claiming reliable coverage for keys with essentially no representative data is a separate commitment.

Train for **new attacks while a pitch is already active**, not merely transitions from inactive to active. Re-strikes must remain separate positive targets. Mechanical precursors, continuing decays, speech, and action-only movements need explicit negative examples.

Compare three variants before scaling:

- Existing network with corrected targets, verified examples, and retuned event decoding.
- A compact temporal model using the same data.
- One larger causal model using the same data and evaluation.

That experiment distinguishes a data problem from a capacity problem. I would absolutely run the third variant if implementation is straightforward. I would not spend two weeks building an elaborate training ecosystem before the first two get a fair test.

Retire NSDF as the final pitch authority if the learned pitch output wins that comparison. It can remain a diagnostic feature. A roughly 21 ms window contains fewer than three periods at C3, and you are applying it to a highly nonstationary attack. Your octave and tuning patches are symptoms of that mismatch.

Likewise, distinguish **key identity from transient frequency estimates**. F4’s early apparent sharpness may reflect real attack behavior, estimator bias, or both. The desired label is still the physical F4 key. A learned spectral classifier can recognize that without rounding a transient fundamental estimate through a per-key correction table.

**Your evaluation plan needs two additions**

Freeze the proposed sets, but keep their results separate: clean calibration, enriched failures, messy prompted playing, and natural practice. Do not report their pooled score as the product’s accuracy.

Most importantly, add a small **randomly selected, continuously labeled sample of natural practice**. Disagreement sampling never finds errors all models share. Use some parent time on those random excerpts even if it means reviewing fewer interesting disagreements. Fully label the short intervals, including quiet notes and no-note periods, rather than only adjudicating proposed events.

Also, examples you repeatedly inspect and use to design patches become a development set. You need a small untouched acceptance set from later sessions. Split by session and by source recording before generating synthetic derivatives.

The AAC replay caveat is a priority-zero measurement problem. Lossy encoding can alter transient structure and low-level spectral evidence; capture and replay may also differ in resampling, channel handling, block boundaries, initialization, or processing settings. Do not assume AAC is the sole cause.

For short diagnostic sessions, save the exact PCM entering the live detector, together with sample indices, configuration, and live outputs. Replay it with identical block boundaries and state initialization. Deterministic paths should reproduce their events; inference backends may require small numerical tolerances. Only then compare PCM replay against AAC replay.

Until that works, you cannot confidently attribute a model improvement measured in Node to the iPad experience.

**The “digital twin” is useful, but it is a sample renderer**

I support recording local samples. I would drop the implication that their mixtures reproduce this piano’s behavior faithfully.

They will get several important things wrong:

- Repeated strikes on already vibrating strings are not simply independent isolated notes added together.
- Dampers, held keys, sympathetic resonance, and pedal state change the sound.
- Soft strikes can have different action-noise-to-string ratios and attack shapes, not just lower amplitude.
- Microphone processing can respond to the combined signal nonlinearly.
- Mechanical noise precedes string onset by a variable interval. Scheduling a sample file’s beginning at a MIDI timestamp does not necessarily create a correctly labeled acoustic onset.

The last point is especially consequential here. Each sample needs an annotated acoustic onset distinct from its file start. Otherwise synthetic training can teach the model to timestamp or detect the mechanical precursor.

I would record multiple exemplars per key and playing strength, rather than exhaustively collecting one neat sample at each of three levels. Prioritize real sequences: quiet repeats, hard repeats, partial releases, held-note-plus-new-note combinations, and adjacent-key accidents. Those address your actual failures more directly than unlimited mixtures of isolated strikes.

Be careful with “real background audio.” If it contains faint piano notes, mixing it as unlabeled background creates false-negative supervision. Also, local iPad samples already contain the room and microphone response; blindly convolving them with additional room responses can produce implausible acoustics.

Use local synthesis to balance pitches, generate overlap, and expose confusers. Use generic libraries for diversity in moderation. Let held-out real child recordings decide the mixture weights. Unlimited synthetic examples can make the model extraordinarily good at your renderer.

**Replacing the loud fallback**

The principled replacement is a **conditional acceptance score calibrated on real attacks and false triggers**, rather than another universal scalar threshold.

Candidate features could include energy above a robust local noise floor, per-pitch spectral change, attack-band flux, learned onset score, harmonic support, model disagreement, and elapsed time since the previous same-pitch event. A small regularized classifier can combine them; you do not need a large network for this gate.

Relative level is better than raw dBFS for gain variation, but it is not sufficient. A loud ringing note raises the local baseline, and a legitimate re-strike can have little total energy increase. That is why your global 6 dB test fails. Frequency-resolved changes and temporal attack structure matter more than a universal rise requirement.

Tune guided and free-play operating points separately. If there are too few verified fallback examples to fit a reliable gate, keep the rule narrow and provisional. An absolute threshold is not forbidden; it is simply weak evidence whose portability you have not demonstrated.

Also, if “expected letter” literally means pitch class, change it to the exact expected MIDI pitch unless the lesson intentionally accepts octave errors. Skipping the speech filter entirely is too broad. Expected-pitch evidence should relax the acceptance criterion while retaining a requirement for a distinct, piano-like attack.

**Mechanical precursors: all three interventions, with different jobs**

Yes: placement, detector structure, and training.

The placement result is promising, but a stand-mounted different microphone changes two variables simultaneously. First compare the same iPad in its usual position and in a safe, mechanically isolated or independently supported position. That isolates the benefit available without a cable or new microphone. Judge soft-note recall and phantom events, not just overall note-to-room level.

In the detector, let a mechanical transient open a candidate window without immediately committing a note. Require subsequent evidence of a pitch-specific excitation. Tonal presence alone is inadequate because the previous note is already ringing; a fixed amplitude increase is inadequate because re-strikes may be weak.

In training, include both precursors that lead to a real strike and mechanical movements that never produce one. The model must learn the distinction. When a precursor leads the string by 250 ms, timestamp the detected note at the acoustic attack, not at the first thump. A microphone cannot reliably recover physical key-contact time, and rhythm scoring should use a consistent acoustic definition.

**Runtime choice**

For a 1–3M-parameter recurrent or convolutional model, I would choose **AudioWorklet capture plus a dedicated worker running single-threaded WASM, using SIMD where the runtime supports it effectively**. Use an established inference implementation if practical. Avoid hand-writing optimized neural-network kernels in JavaScript.

Parameter count alone does not determine cost: convolutional reuse, hidden-state size, feature computation, and invocation overhead all matter. Benchmark the actual graph at the intended update rate. Quantized weights also do not automatically imply efficient integer execution.

Your existing small detector running in the worklet is not automatically a mistake. But average 3% CPU does not measure deadline safety: at 48 kHz, a 128-sample render quantum is only about 2.7 ms. A larger inference workload belongs off that real-time thread.

Transfer bounded PCM batches to the worker, preserve sample indices, monitor queue age, and explicitly handle discontinuities and recurrent-state reset. Benchmark during real UI activity and longer sessions, including latency tails and thermal behavior.

I would defer WebGPU. At these model sizes and batch size one, dispatch and synchronization costs can outweigh compute savings. It becomes attractive only if an actual device benchmark shows WASM cannot meet the budget. I would also defer cross-origin-isolation machinery.

**What I would do over the next two weeks**

In the first few days, fix PCM replay parity, audit the eight missed re-strikes through the entire training and decoding pipeline, and compare learned pitch against NSDF. In parallel, collect the targeted real sequences and a modest random natural-practice evaluation sample.

During the remainder of week one, retrain the tiny baseline with corrected targets and verified failure examples, implement exact-pitch guided verification, and test safe iPad isolation. This should produce a credible baseline and identify whether errors arise in features, model scores, or event decoding.

In week two, train the compact temporal model and one larger challenger. Add a limited amount of local synthetic data as an ablation, not as an unquestioned foundation. Deploy the winner behind a versioned detector interface and verify it live across several sessions.

I would cut velocity estimation, full-keyboard sampling as an immediate requirement, a broad offline-model ensemble, a new large teacher training run, WebGPU, and further general-purpose DSP patching. One strong offline teacher plus targeted independent checks is enough initially; reserve human effort for shared blind spots and random evaluation.

Your direction toward a unified learned detector is right. The course correction is to make **verified re-strike supervision, direct learned pitch, and reproducible live evaluation** the next milestones. Those are more likely to improve the child’s next practice session than scaling the model and data generator together.
## Round 3 prompt (piano-audio)

Mostly persuasive; I concede: (1) my "learned Kong's blind spot" diagnosis was unsupported for those 8 cases (Kong heard them), so auditing targets/decoding comes first; (2) random, fully-labeled natural-practice excerpts are missing and needed; (3) PCM replay parity is priority zero (the app currently uploads AAC; I'll add a diagnostic mode that saves the exact PCM entering the detector); (4) the twin is a sample renderer, and precursor-vs-acoustic-onset annotation matters; (5) worker+WASM for anything bigger.

Two pushbacks and a question:

A. "The network supplies better pitch evidence yet production delegates pitch to NSDF." In that comparison the network path's pitch *also* came from NSDF: the net supplies the onset time, then NSDF reads pitch in a window starting there. The net's own key output was measured earlier and was worse than NSDF (letter accuracy ~83-87% vs ~96% on held-out recordings). So the 6/8 vs 3/8 difference is about *where the pitch window lands*: classic onsets fire early on mechanical precursors and read the previous note; network onsets land later, on the string attack. That supports your "let the precursor open a candidate window, then require pitch-specific excitation" design, and arguably says the fix for pitch is onset timing, not replacing NSDF. Does that change your recommendation to retire NSDF, or do you still want a learned pitch head (and why, given it measured worse)?

B. Exact MIDI vs letter for expected notes: the pedagogy owner deliberately accepts any octave in early lessons (she often plays the right letter in the wrong octave, and they judge that as success at her level). So "expected letter" is a product decision, not an accident. Given that, is there still a detection reason to condition on the exact expected pitch (e.g. use exact-pitch evidence to decide, then report letter)?

C. Constraints on parent time: realistically ~30-45 minutes total over the next two weeks for recording + labeling. How would you allocate it across: targeted real sequences, random natural-practice labeling, verifying disagreements, and the eval freeze? Give me concrete minute budgets and the order.

Then give me your final, prioritized top-7 list for the next two weeks, one line each.

## Round 3: Astra

**A. Yes—that changes my recommendation. Keep NSDF as the production pitch estimator for now.** I misinterpreted the comparison. Your evidence supports improving the time at which pitch is measured, not replacing the estimator that currently wins.

Separate three timestamps: the mechanical candidate, the estimated acoustic onset, and the decision time. A precursor can start tracking; subsequent evidence establishes the acoustic attack; NSDF then reads an appropriately positioned window. Preserve the acoustic onset for rhythm scoring even when pitch needs the longer fallback window.

Run a paired comparison using identical, manually verified acoustic onsets for both pitch estimators. Measure exact MIDI accuracy as well as letter accuracy, and separate repeats, low notes, and two-note accidents. This isolates pitch estimation from onset localization. Your existing 96% letter accuracy is persuasive for early lessons, but does not establish octave accuracy or polyphonic capability.

I would retain a learned pitch head as an experimental challenger, particularly for simultaneous notes and octave ambiguity. I would not make it a replacement requirement. A unified model is architecturally attractive; that is not evidence that it performs better.

**B. Accepting any octave is a valid product policy, and the detector should support it directly.** There is no reason to require the displayed octave before accepting another octave that the lesson explicitly permits.

Keep evidence at exact-pitch resolution internally, then evaluate the permitted set—for example, all supported Cs. That lets the detector distinguish a newly struck C3 from a still-ringing C4. Collapse to letter only at the lesson-policy boundary; retain the estimated octave in logs and composition events.

With NSDF, that means accepting a reliable new attack whose estimated pitch belongs to the permitted pitch class. With per-key model scores, it means testing whether *any permitted key has credible new-attack evidence*. Do not sum arbitrary weak activity across all octaves: that can turn several ringing harmonics into an acceptance. Calibrate the set-level threshold, since allowing more pitches creates more opportunities for false acceptance.

Expected-letter conditioning can relax pitch confidence, but should not automatically waive the requirement for a new piano attack. Singing the expected letter is still a relevant confuser.

**C. I would budget 40 minutes, with a 30-minute minimum and an optional five-minute extension.** The engineer should prepare recording prompts and a labeling interface before consuming parent time.

| Order | Parent task | Budget | Concrete use |
|---|---|---:|---|
| 1 | Verify existing failures | 5 min | Review the eight missed re-strikes and a few precursor false events; confirm pitch and separate attacks. The engineer audits targets and decoding without the parent. |
| 2 | Record targeted sequences | 10 min | Four minutes of soft/loud same-key repeats and partial releases; three of low notes, held-note transitions, and adjacent-key accidents; three repeating a short script with isolated iPad placement. |
| 3 | Fully label random natural-practice excerpts | 15 min | Label every audible piano attack in preselected short intervals, including no-note intervals. Draw across sessions before examining detector outputs. |
| 4 | Label an untouched acceptance sample and finalize exclusions | 10 min | Use randomly chosen excerpts from later sessions; mark ambiguous events explicitly. The engineer freezes files, labels, and scoring rules. |

At **30 minutes**, use 4 / 8 / 12 / 6 minutes respectively. At **45 minutes**, add five minutes to random natural-practice labeling.

Those are labor budgets, not promises about how many minutes of audio can be annotated. Fully labeling messy audio is slow. Use short excerpts, replay controls, suggested timestamps, and an “uncertain” option; reveal model suggestions after an initial listening pass where practical. The parent identifies notes and distinct strikes; the engineer handles precise waveform alignment and flags anything acoustically unresolved.

Keep the targeted recordings as development material. Reserve some random excerpts as evaluation-only and the later acceptance sample as untouched until the candidate is frozen. This budget can guide a sound deployment decision, but it will not necessarily support a statistically strong claim of ≥95% recall across all conditions.

My prioritized top seven for the next two weeks:

1. **Establish PCM replay parity:** reproduce live events from exact detector-input PCM, configuration, block boundaries, and state.
2. **Audit the eight missed re-strikes:** inspect labels, target construction, model scores, and suppression before changing architecture.
3. **Create independent evaluation:** fully label random natural-practice excerpts and reserve a later untouched acceptance sample.
4. **Collect targeted real attacks:** prioritize repeats, soft/low notes, overlap, and a controlled same-iPad isolation comparison.
5. **Improve attack confirmation while retaining NSDF:** separate precursors from acoustic onsets and compare pitch estimators at identical onset times.
6. **Retrain the tiny baseline, then one compact temporal challenger:** use verified supervision and a small sample-rendering ablation; put larger inference in a worker with WASM.
7. **Validate product policies live:** octave-permissive guided acceptance, conservative free-play commitment, and separate recall, phantom-event, and latency measurements.

## Round 4 (2026-09-29): a fully labeled session

### Question

New data, and I'd like you to rethink the approach from scratch if the evidence warrants it. Don't anchor on what we built.

## A fully labeled real session

The parent labeled one of her real homework sessions end to end (51 s, iPad mic on the piano, "Stairs": C3 D3 E3 F3 G3 G3 G3 G3 F3 E3 D3 C3 C3 C3, then the same an octave up in C4-G4). Every moment any source (classic DSP, the tiny net, or Kong offline) heard something became a step in time order, plus checks for unlit key presses and quiet stretches. Result: 25 real key presses, 49 moments with no new key, nothing that every source missed. It's clean, slow, single-note playing. The parent believes 100% is achievable on a clip like this, and I agree.

Also important: when the detector falsely advances homework she skips ahead to play what the app now shows, so her exercise logs are not ground truth. Homework policy is now "prefer misses to false advances" (a grown-up tap covers misses).

## Results on it (before today's change)

Default detector (net above A3, classic below, loud classic fallback above A3): 23/25 caught, 24 false notes.
Classic only: 23/25 caught, 35 false notes.

False-note classes:
1. Re-reads of a note still ringing (16/24): after a real C3, classic onsets fire 0.3-0.7 s later on noise and NSDF re-reads C3 (up to three times); also G4 read over a ringing G3.
2. New non-piano tonal sounds the parent labeled "no piano key" (~8/24): F#5, C5, F#4, G#4, E4, E3 at -47..-60 dBFS (real notes here are -34..-45). Kong also fired on some of them. Most likely the child talking or singing (voice filter only runs below C4), but not confirmed yet.

Misses (2): D4 and F4 that only Kong heard. Net scores at the D4 strike: D5 0.77, A4 0.69, C5 0.42, D4 0.29 (bar 0.8). The strike is split across harmonic keys (Kong's training labels often put D5 with D4).

## What I shipped today

The old tone-rise test (energy at f0 in a 21 ms window after vs before the onset) failed in two ways: a 21 ms Hann window can't separate D4 from a ringing E4 (a real D4 after E4 read -4 dB), and the detector's onset time can precede the real attack. New test: the trough-to-peak jump of harmonics 2-8 of the detected pitch, peak searched from 30 ms before to 20 ms after the onset, trough in the 120 ms before. On all labeled data (this session, 61 earlier disputed moments, calibration takes, grown-up runs), re-reads jump <= 8 dB and real low notes >= 16. Gate at 10 dB for classic-path notes only: session false notes 24 -> 9, calibration extras 11 -> 5, grown-up extras 6 -> 3, no labeled real note lost, no latency change in default mode. (Applied to the net's notes it would lose 3 of her real re-strikes that jump 2-9 dB, so it's not applied there.)

Tried and not shipped: letting the net's "any key was struck" score (1 - prod(1 - p_k)) create extra onsets when no single key passes, gated by the jump: catches one miss (wrong letter), adds 4 false notes.

## Remaining on this session: 23/25 caught, 9 false (about 8 non-piano sounds and one duplicate)

## Questions

1. What would you build to get clips like this to 100% (and hold precision on her messier sessions), given: browser/iPad, worklet (or worker+WASM), a TITAN Xp for training, about 25 min of her real audio with Kong pseudo-labels, and now a small set of verified labels? Is the "strike detector + pitch reader" factorization right, or should a single learned model own both?
2. Non-piano tonal sounds (probably voice) at C4-C5 accepted by the net path: what features or model changes separate a child's voice from a piano strike robustly? The existing drift test (pitch drift over 45 ms > 40 cents) hurt real piano notes above C4 when extended (recall dropped ~7 notes of 84).
3. The harmonic split: retrain with Kong labels cleaned of ghost harmonics (drop an octave-above note that co-occurs with a stronger lower one)? Or a different target, e.g. a pitch-class or "fundamental of the strike" head? Or read the key with NSDF whenever the net says "a strike happened"?
4. Evaluation hygiene: this session is now a dev set (I tuned on it). How should the next parent labeling time be spent: another full session (which kind?), or something else?

Keep it concrete and prioritized. Push back where I'm wrong.


### Astra

The new session changes the priority: **false piano attacks are now the dominant problem, and the lesson’s feedback loop makes them especially costly.** With repeated letters in the exercise, a false re-read is exactly the event most likely to advance homework incorrectly. Expected-note matching cannot protect you from it.

Your harmonic-jump gate is a useful empirical improvement. Keep it provisionally. But its success does not establish a universal distinction between strikes and ringing notes: your network-path re-strikes already demonstrate that real attacks can have small jumps. The distinction is conditional on which events the classic path proposes.

I would target zero errors on this development clip, but reject “100% should be achievable” as an architectural premise. A clean-looking performance can contain acoustically ambiguous events. Zero errors here is a debugging milestone; reliable performance on new sessions is the product criterion.

### 1. Build a piano-attack verifier first, not a full transcription replacement

Keep the current pitch reader and candidate generators while adding **one shared learned verifier before either path can emit a note**. Its question should be:

> Does this interval contain a new piano strike, and is the proposed pitch supported by that strike?

That directly attacks the nine remaining false events, including those admitted by the network. A generic onset detector answers a different question: speech and mechanical noise have real acoustic onsets too.

Concretely, I would build a small causal temporal CNN with:

- A full-spectrum log-magnitude input covering roughly 250–400 ms of history.
- Spectral-change features alongside magnitude, so sustained harmonic energy does not dominate.
- Candidate-pitch-relative features around several harmonics, including their recent trajectories.
- A binary **new piano strike** output, plus an auxiliary **candidate pitch supported** output.

Start small—hundreds of thousands of parameters are sufficient to test this hypothesis. Parameter count is not the present bottleneck. Use bounded post-attack evidence, initially around 50–80 ms, and measure total notification latency rather than assuming the model’s lookahead equals end-to-end delay.

Propose candidates more permissively than you accept them. Retain current proposals, and add low-threshold peaks from network outputs to recover cases such as D4. Merge nearby proposals into one candidate interval; run NSDF at a few plausible acoustic-attack alignments inside it. Let the verifier reject the resulting hypothesis if it is merely reading the previous note.

This preserves a useful factorization:

**candidate interval → pitch hypotheses → joint attack/pitch verification → committed event**

It is not an irreversible commitment to separate models. A shared learned backbone can eventually own all those outputs. But you currently have evidence that NSDF works reasonably well when positioned correctly, and insufficient evidence that replacing it would help.

For training, the verified false events are valuable hard negatives. They are also few and highly correlated within one session. Sample them heavily, but do not mistake repeated windows around nine events for hundreds of independent examples. Treat unverified Kong labels as weak supervision; verified labels should override them, and teacher absence should not automatically become a trustworthy negative.

### 2. Voice rejection needs temporal timbre, not another pitch rule

First, confirm what those eight sounds actually are. Listen to isolated excerpts with context. If some are piano resonance, TV audio, or handling artifacts, training a narrowly named “voice filter” will solve the wrong problem. Their confirmed label is **no new piano key**, which is already sufficient for the verifier.

Useful evidence includes:

- How quickly harmonic energy appears and how it evolves afterward.
- Whether several partials undergo a coordinated new excitation.
- Changes in spectral envelope, including voice-like moving formants.
- Attack-to-decay behavior and high-frequency transient energy.
- Whether the proposed note explains the *new* spectral energy rather than the existing sound.

None is a reliable standalone veto. A sung vowel can have stable pitch; a piano attack can show apparent pitch drift. Breathiness, vibrato, and decay shape are cues, not definitions. Your failed drift extension is a good reason to stop hand-tuning a global voice boundary.

Multiresolution features matter here. Short windows help localize attacks; longer windows provide better harmonic separation. For close pitches, a short-window harmonic-energy measurement can still borrow energy from the neighboring ringing note.

I would also use the level difference as a feature, not ignore it: these false events were quieter than real notes in this session. But a hard threshold between −47 and −45 dBFS would simply overfit this performance and reject future soft playing. Include level relative to recent background and recent verified piano strikes, with spectral evidence carrying the decision.

Train on speech over ringing piano as well as speech alone. The former is the dangerous case: the voice provides the onset while the piano provides a convincing pitch.

### 3. Do not globally delete octave labels

The D4 score pattern suggests harmonic confusion, but it does not by itself prove the proposed label-cleaning rule is correct.

**Do not drop every upper-octave note that co-occurs with a stronger lower note.** Real octave dyads exist, model confidence is not physical loudness, and this rule would teach the future polyphonic detector to erase legitimate notes.

Instead:

1. Inspect the teacher labels and student targets around the verified D4 and F4 misses.
2. Find a small batch of similar octave-coincident teacher events in the training recordings.
3. Verify enough examples to establish whether this is systematic label contamination.
4. Correct verified cases; mark unresolved upper notes as uncertain or exclude their loss rather than confidently labeling them absent.

For deliberately recorded monophonic examples, the known struck key provides much stronger supervision, provided the recording is checked for mistakes.

A **separate piano-strike head** is worthwhile. Train it directly from strike labels. Your `1 - prod(1 - p_k)` construction is not a trustworthy “any strike” probability: the key scores are correlated, generally uncalibrated, and a collection of modest scores can produce a large result. The failed experiment is evidence against that aggregation and gating combination, not against learning a strike head.

An auxiliary pitch-class head could help octave-permissive homework. It will not reject voice, and it will not identify an attack by itself. Nor does octave collapse resolve the entire D4 example: A4 and C5 are different pitch classes.

“Run NSDF whenever a strike head fires” is therefore a reasonable candidate-generation strategy, **provided the strike head recognizes piano strikes and the final verifier checks the pitch against new excitation**. Otherwise you recreate the classic failure with a learned onset trigger.

### 4. Tighten two claims about the new gate

The measured improvement is strong enough to retain the gate while gathering independent evidence. Two details need scrutiny:

- Searching a trough across 120 ms and a peak near the event can associate a noise trigger with an earlier real attack. Test closely spaced notes and repeat intervals around that search-window length.
- Searching through 20 ms after the onset uses future evidence. “No additional latency” is valid if the existing decision already waits long enough; verify that explicitly in the live implementation.

Also, selecting the lowest trough and highest peak tends to inflate a jump statistic. Its threshold may change with window length, noise, and gain processing. Preserve the exact feature definition in evaluation; do not treat 10 dB as a physically meaningful boundary.

Keep duplicate suppression separate from strike verification. Multiple candidates referring to one acoustic attack should share one committed event, but a genuinely new weak re-strike must remain eligible.

### 5. Spend the next labeling time on one untouched matched session

I would choose **another naturally occurring, slow homework session with both low and high notes and consecutive repeated letters**, recorded on a different day in the normal setup. Choose it before inspecting detector outputs. It is the most direct test of whether the improvement generalizes to the claimed easy operating condition.

Label the full timeline, with an initial listening pass independent of model proposals, then use the proposals to check omissions. Your current process is much better than labeling disagreements alone, but “nothing every source missed” remains a finding of that review, not something the detector union can establish by itself.

If possible, record a synchronized keyboard view for this short evaluation session. It helps distinguish a physical press from a new audible attack and avoids asking the parent to infer every event from sound. Decide explicitly how inaudible presses are scored: no audio detector can reliably recover a press that produces no observable sound.

Keep that session untouched until thresholds and training choices are frozen. Spend remaining time verifying short **speech/singing-over-decay and weak-repeat excerpts** from other sessions for training. Do not select a supposedly representative test session because it contains the errors you want to fix.

Evaluate two layers separately:

- Acoustic events: caught strikes, false events per minute, pitch errors, duplicates, and delay.
- Homework behavior: false advances and missed valid advances under the octave-permissive policy.

Replay policy against annotated events, but do not claim to reconstruct the child’s counterfactual performance: different advancements would have changed what she played next.

### Priority order

1. **Verify PCM/live replay parity** before trusting small improvements measured through AAC replay.
2. **Keep the classic harmonic-jump gate provisionally**, with explicit close-repeat and timing checks.
3. **Confirm the remaining false-event sources and audit D4/F4 targets**, rather than assuming voice and ghost labels.
4. **Freeze a new matched natural session** as an untouched acceptance test.
5. **Train a compact shared piano-attack/pitch verifier**, using verified negatives and bounded temporal context.
6. **Add permissive proposals and a directly supervised strike head** to recover misses; retain NSDF initially.
7. **Deploy only if false advances fall on independent audio without unacceptable misses**, then test messier sessions.

The main course change is to stop treating every onset source as independently authorized to emit notes. Both paths should supply hypotheses to one acceptance decision trained specifically on **new piano strikes versus everything else**.


## Round 5 (2026-09-29): soft notes, and how to decide small changes

### Question

Progress report and a request: the parent asked that we collaborate rather than me hill-climbing alone. Please push back hard.

## What happened since round 4

- Built your verifier: a small dilated 1-D CNN (3 conv layers, 24 channels, ~25k weights, int8) over the network's 216-bin log-spectrum from 200 ms before to 15 ms after each candidate. Input: harmonics 1-8 of the candidate pitch, octave below, neighbouring keys, 36 two-semitone bands, total, flux (dB relative to a running peak) + 8 scalars. Outputs: strike / strike of this pitch. Labels: whole-session parent labels > parent-labeled moments > prompted takes (Kong onsets aligned to the prompt) > Kong (weak, silence = half-weight negative). 3-seed ensemble. Used only as a final gate (it can reject; it may not overrule the voice flag; letting it rescue rejected candidates or adding permissive weak onsets made things worse on held-out folds).
- 15 ms post-onset context beat 30 and 60 end to end (net notes 27 -> 37 ms median latency).
- Out-of-fold label audit: the model strongly contradicts none of the parent's ~316 labeled candidates (the 3 flags were my tolerance edges or model errors). A systematic Kong-vs-detector disagreement around A4/A#4 (detector reads ~45 cents flat at the attack on the last two days) is queued for the parent's ears.
- The parent labeled two NEW sessions end to end (her Sep 29 homework: Stairs and the G piece), chosen by the pedagogy agent's priorities before I looked at outputs; I pre-registered A = standard, B = verified, C = verified + more sensitive net (netThr 0.6).
  Stairs: 47 presses / 43 no-key moments: A 32 caught, 18 false; B 32, 3 false; C 32, 4 false.
  G piece: 21 presses / 66 no-key moments: A 16 caught, 10 false; B 16, 3 false; C 16, 4 false.
  B is now the production default (parent OK'd). Soft presses (Kong velocity < 50): 10/28 caught (36%); medium 32/37 (86%). Pedagogy: 86 of her 120 strikes today were soft; soft is her normal touch; soft recall is the main detection goal (homework still prefers misses to false advances; a grown-up tap covers misses; a rhythm gate on a repeated-note piece now tolerates one unheard note per bar).
- Where lone soft strikes (Kong 35-54, earlier sessions) go: 52% caught; 14% 'double' (an earlier same-pitch trigger < 100 ms before, likely early timing); 18% nothing proposed; 10% misread; 4% voice flag. A "new energy" harmonic-sum pitch estimator was worse than NSDF everywhere (dropped).
- On the Stairs misses (which I then looked at, so Stairs is now dev): most were classic readings above A3 rejected because the network didn't fire and they were quieter than the -50 dBFS loud-fallback bar, with verifier scores 0.7-0.98; or only the network's weak any-key score fired.
- Hill-climb on dev (Stairs + session folds with held-out verifier models): rescuing those 'high' readings directly: Stairs +5 caught but -2 right on calibration takes and +4 extras elsewhere (a rescued early/octave reading pre-empts the network's correct note). Routing them through the existing fallback path (wait 100 ms for the net, dup check) with its loudness bar lowered to -60 dBFS and the verifier as the gate (config D): Stairs 32 -> 36, no change on the fold sets. Pre-registered D, tested once on the untouched G set: identical to B (16/21, 3 false). So no evidence it generalizes; not shipped.
- "A bit stronger!" cue idea (pedagogy): 52% of missed soft strikes leave a right-letter trace, but a trace is a real strike only ~60% of the time even at the best verifier band; parked unless a reliable residue remains.

## Where I think we are

Precision is in good shape. Soft-note recall is the problem, and I'm now out of cheap acceptance data (both new labeled sets have been used) and making small rule changes with ~5-note effects, which is exactly the hill-climbing you warned against.

## Questions

1. What would you do next for soft-note recall, concretely? Candidates I see: (a) retrain the onset network with soft strikes emphasized (and Kong ghost cleanup); (b) turn the verifier's strike head into the onset detector itself (run it continuously on frames, not just on candidates); (c) targeted recordings of soft playing (the parent imitating her touch? her own soft playing prompted?); (d) fix the 'double'/early-trigger timing issue; (e) something else.
2. How should I spend parent time now that both acceptance sets are used? Label another full session as the next untouched test (the parent is willing but not infinitely)? Something cheaper?
3. Is there a principled way to decide small changes like config D with this little data, or should I stop evaluating changes that can only move ~5 notes and batch changes into bigger, pre-registered releases?
4. Anything in the verifier design you'd change before it becomes the foundation for more (e.g. how it's trained, the label hierarchy, the 15 ms context)?


### Astra

The verifier produced a real improvement: across the two new sessions, false events fell from 28 to 6 without losing caught notes. Keep B as the baseline.

But I would push back on **“precision is in good shape.”** If caught and false events are disjoint event counts, that is 48/(48+6), or about 89% event precision. Whether that is acceptable depends on how many of those six events advance homework. Measure that directly—especially on repeated letters. Precision is substantially better; it is not a solved constraint.

The bigger conclusion is that **soft playing is your main operating condition, not a corner case**. Optimize for her normal touch, rather than treating adult calibration performance as the baseline and recovering occasional quiet notes.

### 1. My next investment: event timing first, then a soft-trained proposal network

I would prioritize **(d), then (a) supported by a small amount of (c)**. I would not immediately turn the candidate verifier into a continuous onset detector.

First, inspect the “double” category. Fourteen percent is large enough to matter, and it could represent three different problems:

- A valid detection assigned slightly early, outside your matching tolerance.
- A precursor that emits the right pitch and suppresses the subsequent acoustic strike.
- A real preceding strike followed by a genuinely missed repeat.

Those require different fixes. For a small set of examples, plot the acoustic onset, all candidate times, emitted events, and suppression reasons together. Do not classify them solely by a same-pitch event within 100 ms.

If an early event already advanced homework correctly, calling the later event a miss misstates the product outcome, though its rhythm timestamp is still wrong. If the early event was spurious, that is a precision problem masquerading as recall loss.

I would replace “first accepted candidate wins” behavior with a **pending-event arbitration stage** where the evidence justifies it. Nearby proposals can update the pitch and acoustic-onset estimate of one pending event before commitment. Keep this short and measured; do not introduce a universal 100 ms delay or merge every pair inside 100 ms. Real repeats must remain distinguishable.

Next, retrain the existing onset network for **high proposal recall at a bounded candidate rate**, leaving the verifier to control committed events. That is a better-defined task than asking the onset network to achieve production precision itself.

Concretely:

- Oversample verified soft attacks, including those the current network never proposes.
- Preserve weak re-strikes and speech-over-decay negatives in training.
- Audit target alignment and onset-target width.
- Measure proposal recall within a specified timing window **before** pitch reading, voice rejection, deduplication, and verification.
- Report candidates per second alongside proposal recall.

Start with the existing architecture to isolate the data change. If it plateaus, try a modest temporal CNN with longer history. Do not simultaneously change architecture, targets, and decoding and then infer which helped.

Use gain reduction as augmentation, but do not equate it with soft touch. A softly struck piano has different attack spectra and mechanical-to-tonal ratios. Likewise, Kong velocity is a useful descriptive proxy, **not a calibrated measurement of her playing strength**. Your “soft recall” estimate may also exclude or mischaracterize notes that Kong struggles with. Supplement it with local acoustic measurements and a few parent judgments.

I would collect the child’s natural soft playing preferentially. Parent imitation is useful for controlled experiments, but it is not a substitute. Short, low-pressure repeats of familiar phrases are better than asking her to manufacture dozens of isolated “soft” strikes.

### 2. Why I would not simply run the verifier continuously

Your verifier was trained on a selected distribution: detector candidates, a supplied pitch, and relatively meaningful temporal alignment. Running it everywhere changes all three.

Between candidates, it will encounter vastly more negative windows. It also needs a pitch hypothesis before it can construct much of its input. Its apparent candidate-level discrimination does not establish frame-level onset precision.

A continuous strike model is a reasonable experiment, but train it as one:

- Provide full-timeline negatives, including ringing notes and speech.
- Supply explicit acoustic-onset targets.
- Separate pitch-independent strike proposal from pitch-conditioned verification.
- Evaluate event decoding, not just frame classification.

I would reuse the feature code and perhaps learned weights, not assume the existing strike head can be repurposed by changing its invocation frequency.

Also, “rescue made things worse” does not establish that the verifier cannot support rescue. It establishes that the tested **verifier-plus-arbitration system** could not. Your early/octave pre-emption failures are direct evidence that arbitration confounded that experiment.

### 3. Spend parent time on discovery first, acceptance later

Do not immediately purchase another full-session test and consume it on the next threshold.

For the next roughly 20 minutes of parent effort, I would allocate:

| Time | Task |
|---|---|
| 5 min | Adjudicate a compact batch of ambiguous early/double cases, plus the A4/A♯4 issue if it affects current lessons. |
| 5 min | Record short familiar phrases in her normal soft touch, with repeats and low/high transitions; record exact PCM. |
| 10 min | After the next candidate is frozen, label short contiguous excerpts selected in advance from at least two later natural sessions. |

Have the engineer resolve obvious timing cases first. Parent time should answer uncertainties that require ears or knowledge of the performance.

For acceptance, use fixed-duration excerpts, selected independently of detector output, and label them completely. Include the quiet gaps. They need not be full sessions if the detector is replayed with its preceding context intact. Sampling across days gives more information about robustness than another single long clip from one sitting.

Keep a small portion of natural-practice annotation random even while targeting soft strikes for training. Otherwise you will lose visibility into new false-event modes.

The G result remains valid evidence about D: it showed no benefit on that sample. Once inspected, G becomes development data for future choices. That does not invalidate the historical comparison.

### 4. Small changes can be evaluated principledly—but your uncertainty is large

Do not batch unrelated changes merely to make the effect larger. That obscures causality. Batch a coherent hypothesis into a release, with component ablations on development data and one frozen acceptance comparison.

For D specifically, the evidence is:

- A development-set gain.
- No observed gain on the independent G test.
- No observed regression there.

That is **insufficient evidence of benefit**, not evidence that it cannot generalize. Also check how many eligible D-style rescue opportunities existed in G. A session with none tests safety but says little about efficacy.

For each change, maintain paired event accounting:

- Correct strikes newly caught.
- Previously caught strikes lost.
- New false events.
- False events removed.
- Actual false advancements.
- Added notification delay.

Choose the decision rule before inspecting the next test. Since false advancement now matters most, use it as a constraint, then optimize recall within that constraint. Avoid pooling everything into an F1 score.

With only a few sessions, formal significance tests will not create information you lack. Notes within a session are correlated; hundreds of candidate windows are not hundreds of independent trials. Report raw paired changes and session-specific results. “No new false events observed” is not proof of unchanged false-event risk.

I would leave D unshipped for now, but retain it as a diagnostic: **some correct evidence exists behind an amplitude gate, and current scheduling determines whether it helps or hurts.**

### 5. Changes I would make to the verifier’s foundation

**Treat label provenance as uncertainty, not just a priority order.** A prompted take establishes intended pitch better than exact onset. A Kong-derived onset can still align the window incorrectly. Unverified teacher silence is particularly dangerous as a negative label when your goal is recovering teacher-missed soft strikes. Downweighting it by half may not be enough if those negatives vastly outnumber verified positives. Audit sampling and total loss contribution; ignore uncertain regions where appropriate.

**Separate the two targets carefully.** A real strike with an incorrect candidate pitch should be positive for “strike” and negative for “strike of this pitch.” Mechanical noise over a ringing correct pitch should be negative for both. These examples teach exactly the distinctions you need.

**Add realistic alignment jitter during training.** Candidate time is uncertain. Train on several offsets around verified acoustic onsets, while preserving the intended temporal meaning of the outputs. Otherwise the verifier can become accurate only for the proposal timing of the current detector.

**Audit running-peak normalization.** A loud preceding event can change the representation of a subsequent soft strike. That may be useful context, or an unwanted dependency on gain and distant history. Compare it against a representation that retains spectral shape, local background-relative level, and an explicit level scalar. Make normalization state identical in training and replay.

**Keep 15 ms for now.** It won end to end. But “15 ms after candidate” is not necessarily 15 ms after acoustic onset, and FFT alignment adds context too. Document the actual sample support. Longer context losing could reflect unnecessary delay, timing errors, or training behavior—not an inherent absence of useful later evidence.

Finally, the out-of-fold audit is reassuring but limited. A model’s failure to strongly contradict labels is not independent confirmation that those labels are right. Its most useful role there is prioritizing review.

My next release would have one coherent objective: **recover verified soft attacks without letting early candidates steal later correct events**. Fix event accounting and arbitration, retrain the proposal network on representative soft strikes, and leave the successful verifier largely stable. That is a more informative experiment than another amplitude-threshold rescue or a wholesale detector replacement.
