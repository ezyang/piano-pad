# Research: state-of-the-art real-time piano detection on an iPad

Written 2026-09-26 by piano-audio. This asks what "state of the art" looks like
for turning a mic signal into piano notes in real time on an iPad, and whether
we need to go native to get it.

## Summary

- The field has moved to small neural networks (CNN plus a one-directional
  GRU/LSTM) over log-mel spectrograms, trained on MAESTRO (200 h of a
  Disklavier). Offline accuracy on MAESTRO is saturated (note-onset F1 ~96-97%).
  The open problems are **latency** and **robustness to real rooms and mics**.
- The closest match to our situation is **Mobile-AMT** (Yamaha, EUSIPCO 2024).
  - It transcribes polyphonic piano in real time, recorded by phones and
    tablets in ordinary rooms.
  - It has 5.9M parameters and 174 ms latency, and gets 96.3% note F1 on
    MAESTRO.
  - It runs at real-time factor 0.35 (about a third of the audio's duration)
    on **one CPU core of a 2019 iPad Pro**, using ONNX Runtime.
  - The key result is about training data. Trained on MAESTRO alone, it scores
    79% F1 on real phone and tablet recordings of uprights and grands in many
    rooms (the IDMT-PIANO-MM dataset). With augmentation it scores 93%. The
    augmentation adds other piano timbres, ±10-cent detuning, speech and room
    noise, room and mic impulse responses, and clipping. Adding speech to
    training is what keeps talking from turning into notes (with speech added
    to the test audio: 89.7% vs 79.5%).
  - As far as I can find, the weights and code are not public.
- **Latency floor.** A network needs to see some audio after an attack. Online
  models sit around 120-320 ms: Mobile-AMT 174 ms; autoregressive models
  (Kwon et al.) 160-320 ms. Forcing a model to be strictly causal for <30 ms
  latency (Hu et al., ISMIR 2025) drops onset F1 into the 30s-60s. Our DSP
  detector reports pitch a few tens of ms after the attack, so a network would
  make responses *slower*. The note's onset timestamp stays accurate, so
  rhythm scoring doesn't suffer; only what she sees on screen is delayed.
- **Commercial proof it works:** Simply Piano's MusicSense recognizes an
  acoustic piano from a phone mic. Reviews say it is good for single-note
  melodies and struggles with fast polyphony and noise. That's our use case,
  and it's not a hard ceiling.

## Candidate models

| Model | Params | Online? | Latency | Notes |
|---|---|---|---|---|
| Mobile-AMT (Kusaka & Maezawa 2024) | 5.9M | yes | 174 ms | best fit; mobile CPU measured; no public weights found |
| Onsets & Velocities (Fernandez 2023) | 3.1M | throughput yes | demo processes seconds-long chunks | open code + pretrained weights; 24 ms frames; onsets only |
| PAR / PARCompact (Kwon et al. 2024) | 19.7M / 2.7M | yes | 320 ms | 97.0 / 95.5 onset F1 |
| Kong et al. high-resolution (2021) | 20M | no (bidirectional) | offline | open weights (`piano_transcription_inference`); a good **oracle** |
| Basic Pitch (Spotify 2022) | 17K | not streaming as shipped | - | all instruments, runs in the browser; weaker on piano than piano-specific models |

## Web vs native

The model sizes above fit in the browser. Her iPad runs Safari 26.6 (from the
logs).

- **ONNX Runtime Web, WASM:** Mobile-AMT-sized models should run in real time
  in a Worker. It would be slower than native ORT; a guess is 2-3x, so
  real-time factor ~0.7-1.0 on a 2019 iPad Pro and better on newer ones.
  Recent ORT-web ships only the threaded WASM build, which on Safari needs a
  cross-origin-isolated page (COOP/COEP headers). GitHub Pages can't set
  headers, but our service worker (`sw.js`) can add them (the
  "coi-serviceworker" trick). Needs testing on the iPad.
- **WebGPU** has shipped in Safari 26 on iPadOS. For a small per-frame model
  (50 inferences/s) the per-call overhead may cancel the gain; measure it.
- **The mic path is the real unknown.** We ask for
  `echoCancellation/noiseSuppression/autoGainControl: false`, but iOS Safari's
  support for those constraints is poorly documented. Native code can set
  `AVAudioSession` mode `.measurement` and know that processing is off. We
  don't log `track.getSettings()`; ask piano-app to add it.
- **Native** buys Core ML / the Neural Engine (not needed at this size),
  guaranteed raw mic, and lower audio latency. It costs TestFlight/App Store
  distribution (TestFlight builds expire after 90 days), an Xcode build, and
  the loss of push-to-deploy. The middle path is a thin native shell (e.g.
  Capacitor) that loads the web app and adds a native audio+ML plugin behind
  the same `engine.js` contract.

**Recommendation:** stay on the web. Go native only if (a) Safari turns out
to apply voice processing we can't disable, or (b) inference in the browser
measures too slow on her iPad.

## Plan, cheapest first

1. **Better ground truth.** Run Kong's offline model on all her recordings as
   a stronger oracle than `tools/oracle.mjs`. Check it on the labeled
   calibration takes. Then re-measure the live detector against it.
2. **Log mic settings** (ask piano-app): `track.getSettings()` and
   `getCapabilities()` at session start.
3. **Would a network help here?** Run an existing open model (Kong offline;
   O&V) on her recordings and compare with our DSP detector against the same
   truth. If the gain is small, keep tuning the DSP.
4. **Feasibility on the iPad.** Export a randomly initialized
   Mobile-AMT-shaped model to ONNX and time it with ORT-web (WASM and WebGPU)
   on her iPad.
5. **If 3 and 4 pass,** train our own causal Mobile-AMT-style model:
   - Data: MAESTRO plus the augmentation recipe above, including speech noise
     and clusters or bangs as negatives. The pitch range could be cut down.
   - Cost: ~1 A100-day without augmentation, several with it.
   - Validation: her labeled takes.
   - Integration as a hybrid: the DSP onset gives an instant "you played",
     then the network confirms the pitch ~150 ms later. Tell piano-app before
     changing when `onNote` fires.
   - It would also give us chords for free (pedagogy's roadmap).

## Sources

- Mobile-AMT: https://eurasip.org/Proceedings/Eusipco/Eusipco2024/pdfs/0000036.pdf
- Minimum-latency real-time transcription (Hu et al.): https://arxiv.org/abs/2509.07586
- Onsets & Velocities: https://arxiv.org/abs/2303.04485, https://github.com/andres-fr/iamusica_training
- PAR (Kwon et al.): https://arxiv.org/abs/2404.06818
- Streaming transcription with Transformer decoders: https://arxiv.org/abs/2503.01362
- Real-time transcription + score following: https://arxiv.org/abs/2505.05078
- Basic Pitch: https://engineering.atspotify.com/2022/6/meet-basic-pitch
- Safari 26 WebGPU: https://webkit.org/blog/17333/webkit-features-in-safari-26-0/
- ORT-web flags / threading: https://onnxruntime.ai/docs/tutorials/web/env-flags-and-session-options.html
- Simply Piano MusicSense: https://en.wikipedia.org/wiki/Simply_(software_company)
