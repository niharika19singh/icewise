# ICEWISE — Frontend Development Rules

@AGENTS.md

## PROJECT

ICEWISE is an AI-enabled Antarctic navigation decision-support system for research vessels.

The system combines:

- Antarctic environmental and sea-ice data
- Physics-based iceberg drift prediction
- ML residual correction
- Prediction uncertainty
- Probabilistic navigation risk
- Graph-based route optimization
- Adaptive prediction → observation → correction → re-routing

This repository currently focuses on the frontend and interactive prototype experience.

---

## CURRENT OWNER

Saiesha owns:

- UI/UX
- Frontend architecture
- Landing page
- Cinematic visual experience
- Interactive visualization
- Frontend integration

Do not implement backend, ML, physics, routing, database, or data-pipeline logic unless explicitly requested.

---

# PRODUCT EXPERIENCE

ICEWISE must feel like:

> Antarctic expedition + scientific intelligence + cinematic film.

The user should feel physically present in the Antarctic environment.

The experience should feel immersive first and like a website second.

Do NOT turn ICEWISE into a conventional SaaS landing page.

Avoid:

- generic AI dashboards
- excessive glassmorphism
- generic gradient backgrounds
- floating SaaS cards everywhere
- neon cyberpunk styling
- stock "AI technology" visuals
- unnecessary decorative effects
- random UI components without product purpose

---

# FRONTEND STACK

Current stack:

- Next.js
- React
- TypeScript
- Tailwind CSS
- Three.js
- React Three Fiber
- Drei
- GSAP
- @gsap/react
- Motion
- Lenis

Use the existing dependencies.

Do not install additional libraries unless there is a clear technical reason.

Do not replace the existing stack without explicit approval.

---

# LANDING PAGE DIRECTION

The landing page is a cinematic story rather than a collection of cards.

Planned narrative:

1. Hero / Antarctic environment
2. The problem
3. Prediction intelligence
4. Physics + ML
5. Uncertainty
6. Probabilistic risk
7. Route optimization
8. Prediction vs actual
9. Adaptive correction
10. Final CTA

The exact implementation can evolve, but the experience should remain cinematic and technically credible.

---

# HERO — HIGHEST PRIORITY

The hero should create the feeling of being on a research vessel in the Antarctic ocean.

Core environmental layers:

- moving ocean
- giant iceberg
- atmospheric fog
- storm clouds
- distant mountains
- drifting snow/ice particles
- small research vessel
- dynamic lighting
- iceberg reflections
- subtle navigation/intelligence overlays

The ocean should use WebGL/Three.js techniques where appropriate.

Do not fake the primary ocean experience using only CSS animation.

---

# CINEMATIC ANIMATION

Use React Three Fiber / Three.js for:

- 3D environment
- ocean
- particles
- lighting
- camera
- environmental effects

Use GLSL/custom shaders where they provide meaningful visual or performance benefits.

Use GSAP + ScrollTrigger for:

- cinematic scroll timelines
- pinned sections
- camera choreography
- chapter transitions

Use Motion for:

- DOM animations
- typography
- UI transitions
- subtle interaction

Use Lenis for smooth scrolling.

Animations should feel:

- slow
- cinematic
- physical
- atmospheric
- restrained

Avoid excessive bouncing, spinning, or flashy UI animation.

---

# HERO ANIMATION DETAILS

The environment should eventually support:

- continuous ocean movement
- realistic-looking wave displacement
- moving water highlights
- cyan iceberg reflections
- subtle atmospheric motion
- drifting particles
- subtle iceberg environmental illumination
- research vessel bobbing with waves
- occasional distant lightning
- lightning illumination affecting the environment
- lightning reflection on water
- subtle mouse-based camera parallax

Lightning must be rare and cinematic rather than constant.

---

# INTELLIGENCE VISUALIZATION

ICEWISE should visually communicate navigation intelligence without becoming a HUD-heavy cyberpunk interface.

Possible elements:

- iceberg trajectory arcs
- predicted positions
- probability/uncertainty visualization
- vessel route
- alternative routes
- subtle scanning effects
- geographic coordinates
- environmental data markers

Every visualization should communicate a real product concept.

Do not add decorative "AI" graphics simply because they look cool.

---

# DESIGN LANGUAGE

Preferred visual character:

- deep ocean blacks/blues
- icy cyan
- restrained white typography
- subtle warm vessel lighting
- high contrast
- cinematic shadows
- atmospheric depth

Typography should feel editorial/scientific/mission-oriented.

Avoid overly rounded startup typography and excessive UI decoration.

---

# PERFORMANCE

The application should target smooth interaction and approximately 60 FPS on modern laptops whenever reasonably possible.

Prioritize:

- GPU-friendly rendering
- efficient shaders
- reasonable geometry
- optimized textures
- controlled particle counts
- lazy loading of heavy assets
- avoiding unnecessary React re-renders
- proper cleanup/disposal
- responsive rendering
- reduced-motion support

Do not sacrifice the entire application's performance for one visual effect.

---

# RESPONSIVENESS

The experience must work across:

- desktop
- laptop
- tablet
- mobile

Desktop is the primary visual target, but mobile must have a deliberate fallback rather than simply breaking the WebGL scene.

---

# ARCHITECTURE

Prefer reusable components.

Potential structure:

components/
  hero/
  navigation/
  sections/
  ui/

lib/

public/
  images/
  textures/
  models/

Do not create dozens of empty abstractions.

Create components when they have a meaningful responsibility.

---

# DEVELOPMENT WORKFLOW

Work incrementally.

Do NOT attempt to build the entire landing page in one pass.

Preferred order:

1. Foundation
2. Ocean
3. Iceberg/environment
4. Atmosphere
5. Storm/lightning
6. Vessel
7. Camera/parallax
8. Intelligence overlays
9. Typography
10. Scroll choreography
11. Responsive behavior
12. Performance polish

After each major step, verify that the application still runs.

---

# CODE QUALITY

Use:

- TypeScript
- meaningful component names
- clear separation of concerns
- reusable components
- minimal unnecessary abstraction

Do not rewrite working code without a reason.

Do not make unrelated changes.

Do not modify backend/ML architecture.

Do not change package versions unnecessarily.

---

# IMPORTANT PRODUCT RULE

ICEWISE should NOT look like:

"another AI SaaS landing page."

It should look like:

"an Antarctic navigation intelligence system presented as a cinematic experience."

The environment, motion, typography and information design should all reinforce that concept.

---

# TASK BOUNDARY

When given a task:

1. Inspect only the relevant files.
2. Make the smallest coherent change needed.
3. Preserve existing functionality.
4. Run the relevant checks.
5. Report what changed.
6. Do not silently expand scope.

If a requested change requires a major architectural decision, explain the tradeoff before making it.

---

# DO NOT INVENT PRODUCT CAPABILITIES

Do not visually imply that ICEWISE has capabilities that the technical team has not actually implemented.

The frontend may use prototype/simulated data for visualization, but it must not present simulated functionality as a real live operational feed.

The prototype will use historical Antarctic observations replayed chronologically where a simulated operational stream is required.

---

# SOURCE OF TRUTH

The project team/common group discussion is the source of truth for:

- product scope
- architecture
- USP
- responsibilities
- deadlines
- technical decisions

Do not independently expand project scope.

Individual AI assistants are development helpers, not project authorities.

---

# FIRST DEVELOPMENT TASK

Initially focus only on establishing the frontend foundation and cinematic hero environment.

Do not build all landing-page sections yet.

The hero must be visually convincing before expanding the rest of the page.