🇪🇸 [Versión en español](README.md)

# Fistulab · Ultrasound-guided AVF cannulation simulator

[![Deploy](https://github.com/Guithar/ecografo-virtual/actions/workflows/deploy.yml/badge.svg)](https://github.com/Guithar/ecografo-virtual/actions/workflows/deploy.yml)
[![fistulab.com](https://img.shields.io/badge/web-fistulab.com-3fc1c9)](https://fistulab.com/en/)
[![MIT License](https://img.shields.io/badge/license-MIT-8ba0b2)](LICENSE)
[![Support on Ko-fi](https://img.shields.io/badge/Ko--fi-support_the_project-FF5E5B?logo=kofi&logoColor=white)](https://ko-fi.com/fistulab)

**[Fistulab](https://fistulab.com/en/)** is an ultrasound simulator that runs **in the browser**, designed for learning **ultrasound-guided cannulation of hemodialysis vascular access**: native arteriovenous fistulas (AVFs) and arteriovenous grafts (AVGs). It is a free first contact, before moving on to commercial physical simulators. Use it to practice:

- the position of the **transducer**, the **patient**, and the **screen**;
- the relationship between what the screen shows and the **physical reality** being scanned: 3D anatomy with the scan plane and the actual anatomical cross-section;
- step-by-step **cannulation technique**, with the **long-axis (in-plane) approach**, preferred in most units, and the **short-axis (out-of-plane) approach**, with dynamic needle tip positioning;
- **AVF assessment**: diameter, depth, access blood flow (Qa), and Doppler criteria for stenosis.

**Use it at <https://fistulab.com/en/>** (Spanish version at <https://fistulab.com>). No installation or sign-up required.

> ⚠️ **Educational tool.** It is not intended for diagnosis or treatment decisions, and it does not replace supervised hands-on training. The scientific basis and references are in [`docs/en/FUNDAMENTALS.md`](docs/en/FUNDAMENTALS.md); the technique follows, among other sources, [*Punción ecoguiada del acceso vascular para hemodiálisis*](https://nefrologiaaldia.org/articulo/puncion-ecoguiada-del-acceso-vascular-para-hemodialisis/) (in Spanish; Moyano Franco, Salgueira Lazo, Roca-Tey; *Nefrología al día*) and the Spanish GEMAV 2017 guideline. The proposed training pathway and assessment rubric are in [`docs/en/TEACHING_GUIDE.md`](docs/en/TEACHING_GUIDE.md).

## Features

### Physics-based ultrasound simulation (GPU, WebGL2)

The image is not a prerecorded texture. It is computed every frame from the anatomical model, using a physics-based convolution method (Bamber–Dickinson / Gao, COLE style), in eight steps:

1. **Speckle.** Complex scatterers fixed to the tissue. The speckle moves with the anatomy and decorrelates when the probe is moved out of plane.
2. **Acoustic properties per tissue** (impedance, attenuation, backscatter):
   - skin, fat with septa, fascia;
   - muscle with a "starry sky" pattern;
   - anisotropic tendon, honeycomb nerve, bone;
   - intima-media vessel wall, blood, thrombus, hematoma, PTFE graft, calcification.
3. **Specular reflection at interfaces** depending on the angle of incidence. It produces transmission losses, **acoustic shadowing**, **posterior acoustic enhancement**, and **edge shadowing**.
4. **Axial and lateral PSF** depending on frequency and **focus**, and depth-dependent **slice thickness (elevation)**. This is how partial volume appears, along with the error of mistaking the needle shaft for the tip.
5. **Processing chain:**
   - envelope, gain, 8-band **TGC**, dynamic range, and log compression;
   - persistence, speckle reduction, and gray maps;
   - electronic noise.
6. **Probe–skin contact:** gel, loss of contact (air) at the edges, and tissue **compression**. Veins collapse according to their intraluminal pressure; arteries do not.
7. **Analytic needle:**
   - specular reflection from the crest of the cylinder, which depends on the insertion angle: in plane it is visible up to ≈ 45°; out of plane the dot is fainter;
   - **reverberations** ("comet tail" and parallel lines of decreasing intensity), shadowing, and tip enhancement;
   - wall **tenting** before the "pop".
8. **Doppler:**
   - **color and power**: velocity from Q/A continuity, flow profile, swirling flow in aneurysms, turbulence, **aliasing**, wall filter, priority, and ±20° steering;
   - **pulsed-wave Doppler** with spectrogram, angle correction, automatic measurements (PSV, EDV, RI, PI, TAMV, **Qa**), and **stereo Doppler audio**.

### Physical reality in 3D

- **Arm and hand:**
  - mesh generated from the same geometry the simulator uses;
  - skin with micro-relief and adjustable transparency;
  - vessels, nerves, tendons, bones, and muscle;
  - **flow particles** to show the direction and velocity of the blood.
- **Scan plane** inside the arm, with the ultrasound image or the anatomy projected onto it ("augmented reality" view, as in high-end simulators).
- **Actual anatomical cross-section** of the scan plane, labeled, next to the ultrasound screen. A **fusion** control overlays it on the ultrasound image.
- **Hemodialysis room:**
  - chair and patient with a selectable skin phototype;
  - ultrasound machine on a cart, with the **monitor showing the live image**;
  - hemodialysis machine;
  - operator whose arms follow the probe and the needle;
  - **operator's first-person view**.

### Clinical cases (common difficulties)

| Case | Difficulty |
|---|---|
| Arm without AVF: normal anatomy and preoperative mapping | Basic |
| Mature radiocephalic AVF: reference case | Basic |
| **Deep** brachiocephalic AVF in an obese patient | Intermediate |
| **Tortuous** AVF | Intermediate |
| **Juxta-anastomotic stenosis** (aliasing, PSV > 400 cm/s) | Intermediate |
| **Aneurysm with mural thrombus** and swirling flow | Advanced |
| **Immature** AVF with competing accessory vein | Intermediate |
| **Collateral veins** and duplication | Intermediate |
| **Transposed brachiobasilic** AVF (brachial artery and median nerve nearby) | Advanced |
| **PTFE loop graft** (double wall, 45°, no tourniquet) | Intermediate |
| **Hematoma** after failed cannulation | Advanced |
| Diabetic patient with **calcified arteries** (shadowing) | Intermediate |

All cases can be used with either the left or the right arm.

### Cannulation and assessment

- **Arterial and venous** needles, 14–17G, 25 or 32 mm. Three ways to place them: long-axis (in-plane) approach, short-axis (out-of-plane) approach, or a click on the skin. The N key chooses the approach based on the probe view.
- **Cannulation checklist** that ticks itself off: arm at about 45° from the body, vein located and measured, suitable site, tourniquet, **asepsis** (sterile cover and gel), needle placed, tip in the lumen, alignment and saline flush, confirmation.
- Each case explains **why ultrasound-guided cannulation is indicated** (first cannulations, deep AVF, poor maturation, stenosis, hematoma…).
- Control of the angle, heading, and advance.
- **Clinical events:**
  - skin puncture, tenting, loss of resistance;
  - **flashback** (pulsatile and bright red if the puncture is arterial);
  - back-wall contact, **transfixion** with an **expanding hematoma**;
  - arterial puncture, **paresthesia** from nerve contact, bone contact;
  - **saline flush** to check the position: with the tip in the lumen, microbubbles carried by the flow and a jet on color Doppler; outside the lumen, **infiltration** (anechoic halo around the vessel).
- **Metrics.** Inspired by NeedleTrainer, PerkTutor, and Sites et al. 2007:
  - total time and skin-to-flashback time;
  - skin punctures and redirections;
  - **% of the advance with the tip visible**;
  - number of times the shaft was mistaken for the tip;
  - probe movement while the needle advances;
  - vessel collapse;
  - needle path length in tissue.
- **Final assessment based on the guidelines** (KDOQI 2019, GEMAV 2017):
  - tip in the access lumen and centered;
  - intraluminal travel and alignment with the vessel;
  - ≥ 3 cm from the anastomosis and ≥ 5 cm between needles;
  - antegrade venous needle;
  - outside the zones to avoid (aneurysm, stenosis, hematoma);
  - aseptic technique;
  - correct tourniquet use.
- Printable, exportable **report** (JSON and CSV), with the history saved in the browser.

### Ergonomics (room)

- Drag the ultrasound machine and the operator. Adjust the patient's arm (angle from the body, lowering, rotation) and the monitor (swivel, tilt, height).
- The simulator evaluates:
  - **gaze alignment** between the cannulation site and the screen;
  - total gaze shift;
  - screen distance, height, and orientation;
  - the operator's reach;
  - **consistency between the probe marker and the screen**;
  - the **patient's arm**, resting on a firm, flat surface at about 45° from the body.

### Learning

Eight guided lessons with **automatic checking** of each step:

1. Orientation.
2. Image optimization.
3. Artery vs. vein.
4. Rule of 6s.
5. Long-axis (in-plane) approach, the preferred one.
6. Short-axis (out-of-plane) approach, with dynamic needle tip positioning (DNTP).
7. Artifacts.
8. Doppler of the AVF.

### Focus mode (desktop)

With the **Focus** button or the `O` key, the monitor takes up almost the entire central area and the 3D arm moves to a **floating window** (in the room, the other way around: the room is large and the monitor floats). On a 1366 × 768 laptop, the image grows from 9.8 to about 17 px/mm.

- The window can be dragged (⠿) to any corner, resized (◱), swapped with the large view (⇄), or hidden (–). The ultrasound image shifts so it is not covered.
- The anatomical section and the tabs move to a collapsible side column, which expands automatically when you confirm a cannulation.
- With the 3D view floating, the probe position or the needle status is summarized below the image.
- It is remembered for each mode. By default it is on in **Cannulation**.

### Mobile version

On phones, tablets in portrait orientation, and small windows, a **touch interface** opens with the same simulator:

- **Screen:**
  - in portrait, the ultrasound monitor fills almost the entire screen and the 3D arm goes into a **thumbnail** (⇄ swaps the views, "View" changes the camera, and "–" hides the 3D view);
  - in landscape, the monitor stays in the center and the 3D view, with the controls, on the right.
- **Probe:**
  - one finger on the 3D arm moves the probe to that point; off the arm, it orbits the camera, and two fingers zoom;
  - fine maneuvers (slide along, slide around, rotate, tilt, rock, pressure) are done with an **adjustment wheel**, as are depth, gain, and focus.
- **Cannulation:** the wheel controls the needle **advance**, angle, and heading, with buttons for **asepsis** and **saline flush**. When you **confirm**, the assessment appears.
- **Lessons:** all eight, with the text adapted to touch controls.
- **More settings:** case, arm, quality, frequency, full Doppler, needle, 3D layers, and report.
- **Performance:** on phones and tablets it renders at 30 fps, without shadows and without the room (it can be enabled under "More").
- **Installable:** you can **add it to the home screen** from the browser. It then opens full screen and works offline after the first visit.
- **Desktop only:** the room and ergonomics, the anatomical section in a separate panel (on mobile, use "Fusion"), and band-by-band TGC.

## Usage

It requires a recent browser with **WebGL2** (Chrome, Edge, Firefox, or Safari) and, ideally, a dedicated graphics card. If it runs slowly, lower the quality in the top bar (on mobile, under "More").

Start in **basic mode**, with the cannulation controls. The **More controls** button, to the right of the console, shows Doppler, PW, and the fine image settings.

To use it, just open <https://fistulab.com/en/>; the Spanish version is at <https://fistulab.com> (**ES** button in the top bar; on mobile, under "More"). To work with the code:

```bash
npm install
npm run dev          # development server at http://localhost:5173
npm run build        # static site in dist/ (e.g. GitHub Pages)
npm run build:single # a single self-contained HTML file in dist-single/ (opens without a server)
npm run typecheck
npm test             # unit tests (hemodynamics, model, needle, metrics)
node tests/e2e-puncion.mjs http://localhost:5173/  # full cannulation with clicks and keyboard in Chromium (requires Playwright)
```

### Deploying to fistulab.com

The `.github/workflows/deploy.yml` workflow publishes the site to **GitHub Pages**, with the custom domain **fistulab.com**, on every push to `main`. Before publishing, it runs the tests and builds the site. It can also be triggered manually from the *Actions* tab.

One-time setup:

1. *Settings → Pages → Build and deployment → Source*: **GitHub Actions**. Do not use "Deploy from a branch". That mode publishes the uncompiled source files, and the page gets stuck on the loading screen.
2. *Settings → General → Default branch*: `main`.
3. **Domain DNS** (at the registrar, DonDominio): remove the parking records and add

   | Type | Name | Value |
   |---|---|---|
   | A | `@` | `185.199.108.153`, `185.199.109.153`, `185.199.110.153`, `185.199.111.153` (four records) |
   | AAAA | `@` | `2606:50c0:8000::153`, `2606:50c0:8001::153`, `2606:50c0:8002::153`, `2606:50c0:8003::153` (four records) |
   | CNAME | `www` | `guithar.github.io` |

   No wildcard records (`*.fistulab.com`): GitHub advises against them, and they would send any subdomain to another site.

   **Email.** The `@fistulab.com` addresses are hosted by Banahosting. Their records are added in this same DonDominio zone, with the values cPanel provides under *Email Deliverability*:
   - MX;
   - `mail`;
   - SPF: there can only be one, so replace DonDominio's with Banahosting's;
   - DKIM (`default._domainkey`);
   - DMARC (`_dmarc`).

   Do not change the name servers to Banahosting's: the website would stop pointing to GitHub Pages.

4. *Settings → Pages → Custom domain*: `fistulab.com`. Once GitHub has checked the DNS and issued the certificate, check **Enforce HTTPS**. `www.fistulab.com` and the old address (`guithar.github.io/ecografo-virtual`) redirect automatically to `https://fistulab.com`.
5. Recommended: verify the domain in your GitHub account settings (*Settings → Pages → Add a domain*, with a TXT record). That way no one else can use it on GitHub Pages.

With *Actions* as the source, no `CNAME` file is needed: the domain is stored in the repository settings.

If a deployment fails with "Branch "main" is not allowed to deploy to github-pages", add `main` under *Settings → Environments → github-pages → Deployment branches and tags*.

**Search engines.** Each language is its own page with its own title, description, social image (`og.jpg`, `og-en.jpg`), structured data (schema.org), and `hreflang` links to the other version; `public/sitemap.xml` lists both and `public/robots.txt` points to it. After the first deployment, add `https://fistulab.com` to [Google Search Console](https://search.google.com/search-console) and [Bing Webmaster Tools](https://www.bing.com/webmasters) (verified with a TXT record at DonDominio) and submit the sitemap.

Useful URL parameters (the names and values are in Spanish and work on both language versions, e.g. `https://fistulab.com/en/?caso=rc_estenosis&modo=cannulate`):

| Parameter | Values |
|---|---|
| `?caso=` | case: `rc_madura`, `bc_obeso`, `rc_estenosis`… |
| `?modo=` | `explore`, `cannulate`, `room`, `learn` |
| `?calidad=` | quality: `alta`, `media`, `baja` (high, medium, low) |
| `?camara=` | initial camera view |
| `?max=` | `3d`, `us`, `anat` (maximized panel) |
| `?movil=` | `1` forces the touch interface, `0` the desktop one |
| `?vista=` | `enfoque` (focus) or `cuadricula` (grid) in all modes (e.g. for projecting in class) |

### Main controls

| Action | Keyboard / mouse |
|---|---|
| Slide the probe | `W` `S` (along the arm), `A` `D` (around it); or drag the probe in 3D |
| Rotate / tilt / rock | `Q` `E` / `R` `F` / `T` `G` |
| Pressure | `Z` `X` |
| Short-axis / long-axis view of the vessel | `1` / `2` |
| Place, advance, and confirm the needle | `N` (switches to Cannulation mode), `↑` `↓` (or the mouse wheel over the image), `Enter` |
| Needle angle / heading | `PgUp` `PgDn` / `←` `→` |
| Depth / gain | `+` `−` / `[` `]` |
| Color / PW / B-mode / freeze | `C` / `P` / `B` / `Space` |
| Flush the needle with saline | `J` |
| Measure / labels / flip L-R / tourniquet | `M` / `L` / `I` / `K` |
| Camera views / focus mode / help | `V` / `O` / `H` |

## Architecture

```
src/
  anatomy/     arm shape (elliptical SDF), tubular structures, hemodynamics, tissues, cases
  sim/         GPU ultrasound engine (multi-pass shaders), pulsed-wave Doppler, and audio
  scene/       3D scene: skin (surface nets), anatomy, probe, needle, room, cameras
  interaction/ probe pose (PART maneuvers) and needle physics
  training/    metrics, ergonomics, and lessons
  ui/          monitor, console, panels, and report; mobile.ts: touch interface;
               focus.ts and floating.ts: focus mode and floating window
  app/App.ts   orchestration and main loop
  pwa.ts       installable app (public/: manifest, icons, and service worker)
  i18n.ts      page language (Spanish or English)
```

**Languages.** `index.html` (Spanish, `/`) and `en/index.html` (English, `/en/`) load the same code; the language comes from `<html lang>`. UI texts are written in both languages with `tr('español', 'English')` (`src/i18n.ts`), and both HTML files share the same structure: a change in one goes into the other too (`tests/unit/i18n.test.ts` checks it). The English documentation is in [`docs/en/`](docs/en/) and this file.

The same anatomical description feeds:

- the ultrasound simulation (segment-based evaluation on the GPU);
- the 3D meshes;
- the CPU queries (needle physics, pulsed-wave Doppler, labels).

That is why the screen and the "reality" always match.

## Privacy

No cookies, no analytics, and no ads. Everything is computed in the browser and nothing is sent to any server; the fonts are served from the site itself. The cannulation history and preferences are stored only in each user's browser (`localStorage`). GitHub Pages, the host, may log visitors' IP addresses for security purposes.

## Support the project

Fistulab is free and will remain so. If you find it useful for training your unit, you can support it with a coffee on **[Ko-fi](https://ko-fi.com/fistulab)**: it helps keep it running and add new cases, lessons, and languages.

## License

MIT. Clinical and technical contributions are welcome: new cases, validation of values, and translations. Open an [issue](https://github.com/Guithar/ecografo-virtual/issues) or write to **[hola@fistulab.com](mailto:hola@fistulab.com)**.
