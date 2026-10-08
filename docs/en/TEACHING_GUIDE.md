🇪🇸 [Versión en español](../GUIA_DOCENTE.md)

# Fistulab Teaching Guide

A proposed training pathway for nurses and physicians working in hemodialysis units.
The simulator covers the **cognitive learning and eye–hand–screen coordination** phase, which comes before:

1. physical simulators (manikins and *phantoms*);
2. supervised cannulation of patients.

## Learning objectives

By the end of the pathway, participants will be able to:

1. **Set up the scene**:
   - patient's arm resting on a firm, flat surface, at about 45° from the body, extended and relaxed;
   - operator seated;
   - screen in the operator's line of sight, behind the cannulation site;
   - probe marker consistent with the screen.
2. **Optimize the image**: preset, depth, focus, gain, TGC, and frequency.
3. **Recognize the anatomy** of the forearm and upper arm:
   - differentiate artery from vein (compressibility, pulsatility, Doppler);
   - identify the venae comitantes, the median, ulnar, and radial nerves, and the tendons.
4. **Assess the AVF**:
   - diameter, depth, and course;
   - access blood flow (Qa) measured in the brachial artery;
   - maturation criteria (KDOQI / GEMAV) and criteria for significant stenosis.
5. **Recognize common difficulties**: deep or tortuous AVF, stenosis, aneurysm with thrombus, collateral veins, transposed vein, AV graft (AVG), and hematoma.
6. **Perform ultrasound-guided cannulation**, following the steps of the procedure (the simulator checks them off in the *Cannulation* tab):
   - using aseptic technique (disinfected skin, sterile probe cover and gel);
   - with the **long-axis (in-plane) approach**, preferred in most units;
   - with the **short-axis (out-of-plane) approach**, tracking the tip with dynamic needle tip positioning (DNTP);
   - keeping the tip visible throughout the advance, without puncturing the back wall;
   - respecting the distances (≥ 3 cm from the anastomosis, ≥ 5 cm between needles) and the direction of the venous needle.

## Proposed pathway

Six sessions of about 45 minutes each.

| Session | Content | Mode / cases | Evidence of achievement |
|---|---|---|---|
| 1 | Orientation and ergonomics | Lesson 1; **Room & ergonomics** mode | Ergonomics ≥ 80 points; consistent probe orientation |
| 2 | Knobology and artifacts | Lessons 2 and 7; *Obese patient* and *Calcified arteries* cases | Vessel centered, focus at vessel depth, 5 artifacts identified |
| 3 | Anatomy and Doppler | Lesson 3; *Arm without AVF* case | Distinguish artery from vein at 3 locations; triphasic vs. monophasic waveform |
| 4 | AVF assessment | Lessons 4 and 8; *Immature AVF* and *Stenosis* cases | Diameter ± 0.5 mm; Qa ± 20%; decide whether the AVF is suitable for cannulation |
| 5 | Long-axis (in-plane) approach | Lesson 5; *Mature radiocephalic AVF* case | Score ≥ 75; tip visible ≥ 80% of the advance; no transfixion |
| 6 | Short-axis (out-of-plane) approach and difficult cases | Lesson 6; *Tortuous AVF*, *Aneurysm*, *Transposed brachiobasilic AVF*, *PTFE graft*, and *Hematoma* cases | Score ≥ 75 in 3 difficult cases |

## Cannulation rubric

The simulator score starts at 100 points and subtracts penalties:

| Error | Penalty | Reference |
|---|---|---|
| Additional skin puncture | −8 each | Eves 2021 |
| Redirection within the tissue (changing the angle or heading by more than 4° with the tip outside the lumen; lowering the angle and aligning the needle inside the lumen does not count) | −3 each | |
| Back-wall contact | −6 | Blaivas 2009 |
| Transfixion (back-wall puncture) | −18 | |
| Unintended arterial puncture | −30 | |
| Nerve contact | −20 | |
| Saline infiltration (flushing with the tip outside the lumen) | −12 | |
| Mistaking the needle shaft for the tip (advancing while the beam cuts across the shaft) | −4 | |
| Advancing with the tip visible < 80% of the time (in plane, the stretch in which the tip, aligned with the plane, has not yet entered the image does not count) | −0.4 per percentage point | NeedleTrainer; Sites 2007 |
| Probe movement > 8 mm while the needle advances | up to −8 | Sites 2007 |
| Vessel collapse > 50% from excessive pressure | −5 | |

Final criteria (when you press *Confirm cannulation*):

| Criterion | Penalty if not met |
|---|---|
| Tip in the access lumen | −35 |
| Intraluminal travel ≥ 5 mm | −8 |
| Tip centered | −5 |
| Needle aligned with the vessel (≤ 25° between the needle and the vessel axis, which may differ from the angle to the skin) | −5 |
| ≥ 3 cm from the anastomosis | −10 |
| Within the recommended zone | −5 |
| Outside the zones to avoid | −15 |
| Antegrade venous needle | −10 |
| ≥ 5 cm between the needle tips | −10 |
| Aseptic technique (disinfected skin, sterile cover and gel) | −5 |
| Appropriate tourniquet use | −2 / −5 |

Indicative levels:

| Score | Level |
|---|---|
| ≥ 90 | Excellent |
| 75–89 | Competent |
| 55–74 | Needs work |
| < 55 | Insufficient |

## Group use

- Each participant opens it on their own computer at <https://fistulab.com/en/>, with nothing to install and no sign-up (browser with WebGL2).
- A link with parameters opens a case and a mode directly, which is useful for assigning exercises. For example, `https://fistulab.com/en/?caso=rc_estenosis&modo=cannulate`.
- Project the simulator in the classroom with the 3D panel maximized (⤢ button) to explain the relationship between the probe, the scan plane, and the image.
- Ask participants to check each cannulation with a **saline flush** (J) before confirming it. With the tip in the lumen, microbubbles are seen traveling along the vessel; if they flush with the tip in the wall (tenting, before the "pop"), infiltration appears. It is a good exercise for learning to recognize it.
- Start in **basic mode** (cannulation controls only) and follow the **cannulation checklist** in the *Cannulation* tab, which ticks itself off. The **More controls** button, to the right of the console, shows Doppler, PW, and the image settings for sessions 2–4.
- Ask participants to read, in the *Case* tab, **why ultrasound-guided cannulation is indicated** in each case (first cannulations, deep AVF, poor maturation, stenosis, hematoma…).
- Turn on **Fusion** (anatomy over the ultrasound image) and **Labels** for the first sessions. Turn them off, along with **Aids**, for assessments.
- The report (**Report** button) can be printed or exported as JSON or CSV for each participant's portfolio. The history is saved in the browser.

## Limitations

- The simulator does not reproduce tactile feedback (resistance, "pop"), palpation of the *thrill*, or real aseptic preparation: asepsis is a step (*Asepsis* button) and an assessment criterion.
- The anatomy is an idealized adult model. Real-world variability is greater.
- The image is generated by convolution with a simplified physical model, designed so that learning transfers to practice, not to make measurements like a real scanner.
- The simulator's figures (diameters, flows, velocities) are teaching values consistent with the literature. They are not normative reference values.
