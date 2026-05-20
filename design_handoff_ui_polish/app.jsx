/* ============================================================
   App — Design canvas layout: 6 rows × 3 directions
   Plus Tweaks for accent / density / forecast style
   ============================================================ */

// Defaults defined inline in index.html (EDITMODE block) so the host can
// rewrite them on disk.
const TWEAK_DEFAULTS = window.__tweakDefaults;

// Curated accent palettes. "default" = per-direction accent (the original triplet).
const ACCENT_PALETTES = {
  default: null,
  sky:     "oklch(0.76 0.10 235)",
  green:   "oklch(0.82 0.16 150)",
  amber:   "oklch(0.80 0.13 60)",
  magenta: "oklch(0.74 0.14 330)",
};

function applyAccent(value) {
  const css = ACCENT_PALETTES[value];
  const sheet = document.getElementById("accent-override");
  if (!css) {
    sheet.textContent = "";
    return;
  }
  sheet.textContent = `.dir { --accent: ${css} !important; }`;
}

const DENSITY_VARS = {
  compact:     { "--page-pad": "20px 28px", "--card-pad": "14px 16px", "--stack-gap": "14px" },
  comfortable: { "--page-pad": "28px 36px", "--card-pad": "18px 20px", "--stack-gap": "18px" },
  spacious:    { "--page-pad": "40px 48px", "--card-pad": "24px 28px", "--stack-gap": "24px" },
};

function applyDensity(value) {
  const v = DENSITY_VARS[value] || DENSITY_VARS.comfortable;
  const css = Object.entries(v).map(([k, val]) => `${k}: ${val};`).join("\n");
  document.getElementById("density-override").textContent = `
    .dir { ${css} }
    .dir .page { padding: var(--page-pad); }
    .dir .card { padding: var(--card-pad); }
    .dir .stack > * + * { margin-top: var(--stack-gap); }
  `;
}

// Artboard sizes — wide enough to read at canvas zoom.
const W = 1180;

// Wrap a screen in its direction container.
function Frame({ dir, children }) {
  return <div className={"dir dir-" + dir} style={{ width: "100%", height: "100%" }}>{children}</div>;
}

function App() {
  const [t, setTweak] = useTweaks(TWEAK_DEFAULTS);

  React.useEffect(() => { applyAccent(t.accent); }, [t.accent]);
  React.useEffect(() => { applyDensity(t.density); }, [t.density]);

  const DIR = "quiet";

  const sections = [
    { id: "picker",    title: "1 · Exam picker",              sub: "Landing — pick an exam to study.",                   C: Picker,    h: 720 },
    { id: "dashboard", title: "2 · Dashboard",                sub: "Per-exam home — stats, due-now hero, recent runs.",  C: Dashboard, h: 880 },
    { id: "exam",      title: "3 · Exam runner",              sub: "Question card with answer map sidebar.",             C: Exam,      h: 900 },
    { id: "library",   title: "4 · Library",                  sub: "Grid of all questions, filterable; topic coverage.", C: Library,   h: 1080 },
    { id: "practice",  title: "5 · Single-question practice", sub: "From the library — immediate feedback.",             C: Practice,  h: 900 },
    { id: "results",   title: "6 · Results",                  sub: "Score banner, per-topic breakdown, review cards.",   C: Results,   h: 1380 },
  ];

  return (
    <>
      <DesignCanvas>
        {sections.map(s => (
          <DCSection key={s.id} id={s.id} title={s.title} subtitle={s.sub}>
            <DCArtboard id={s.id + "-quiet"} label="Quiet" width={W} height={s.h}>
              <Frame dir={DIR}><s.C dir={DIR} /></Frame>
            </DCArtboard>
          </DCSection>
        ))}
      </DesignCanvas>

      <TweaksPanel title="Tweaks">
        <TweakSection label="Visual">
          <TweakRadio
            label="Accent"
            value={t.accent}
            options={[
              { value: "default", label: "Per-dir" },
              { value: "sky", label: "Sky" },
              { value: "green", label: "Green" },
              { value: "amber", label: "Amber" },
              { value: "magenta", label: "Magenta" },
            ]}
            onChange={(v) => setTweak("accent", v)}
          />
          <TweakRadio
            label="Density"
            value={t.density}
            options={[
              { value: "compact", label: "Compact" },
              { value: "comfortable", label: "Comfortable" },
              { value: "spacious", label: "Spacious" },
            ]}
            onChange={(v) => setTweak("density", v)}
          />
        </TweakSection>
      </TweaksPanel>
    </>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
