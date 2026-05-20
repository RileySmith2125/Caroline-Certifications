/* ============================================================
   Screens — six surfaces of the practice app.
   Each takes a `dir` prop ("quiet" | "console" | "editorial")
   used for small direction-specific copy/decorative tweaks.
   The bulk of styling comes from the parent `.dir-<name>` class
   set by the artboard, consuming styles.css.
   ============================================================ */

/* ─── tiny helpers ─────────────────────────────────────────── */
function Topbar({ active, code = "PL-200", dir }) {
  const nav = [
    { k: "dash", label: "Dashboard" },
    { k: "exam", label: "Exam" },
    { k: "library", label: "Library" },
    { k: "results", label: "Results" },
  ];
  return (
    <div className="topbar">
      <div className="row" style={{ gap: 14 }}>
        <span className="brand">Cert Practice</span>
        <span className="faint mono" style={{ fontSize: 12 }}>/</span>
        <span className="mono" style={{ fontSize: 12, color: "var(--accent)" }}>{code}</span>
      </div>
      <div className="nav">
        {nav.map(n => (
          <a key={n.k} className={active === n.k ? "on" : ""}>{n.label}</a>
        ))}
      </div>
      <div className="row" style={{ gap: 12, color: "var(--muted)", fontSize: 12 }}>
        <span className="mono">streak · 6d</span>
        <span style={{ width: 28, height: 28, borderRadius: 99, background: "var(--surface-2)", border: "1px solid var(--border)" }} />
      </div>
    </div>
  );
}

function Eyebrow({ children }) { return <div className="eyebrow">{children}</div>; }

/* ===========================================================
   1) PICKER
   =========================================================== */
function Picker({ dir }) {
  const intro = {
    quiet:    "Each exam has its own pool, progress, and spaced-repetition queue.",
    console:  "// each exam keeps its own pool, progress, and srs queue",
    editorial:"Each exam carries its own pool, its own progress, its own spaced-repetition queue.",
  }[dir];

  return (
    <div className="dir">
      <div className="topbar">
        <span className="brand">Cert Practice</span>
        <div className="muted mono" style={{ fontSize: 12 }}>v2 · local-only · {new Date().toLocaleDateString()}</div>
      </div>
      <div className="page">
        <div className="picker stack">
          <Eyebrow>Choose an exam</Eyebrow>
          <h1>{dir === "editorial" ? "Pick where to study." : "Pick an exam"}</h1>
          <p className="lede">{intro}</p>

          {[PL200, MB330].map((ex, i) => (
            <a key={ex.code} className="exam-card">
              <div className="code">{ex.code}</div>
              <div>
                <div className="ttl">{ex.title}</div>
                <div className="sub">{ex.total} questions · {ex.attempted} attempted · {ex.dueToday} due today</div>
              </div>
              <div className="meta">
                <div className="n">{ex.accuracy}%</div>
                <div>lifetime</div>
              </div>
            </a>
          ))}

          <div style={{ marginTop: 24, color: "var(--muted)", fontSize: 12, display: "flex", gap: 14 }}>
            <span>{dir === "console" ? "[?]" : "?"} Add a new exam by dropping a bundle in <code style={{fontFamily:"var(--font-mono)"}}>/data</code></span>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   2) DASHBOARD — with SRS forecast visualization
   =========================================================== */
function Forecast({ dir }) {
  const max = Math.max(...forecast.map(d => d.count));
  if (dir === "console") {
    return (
      <div className="forecast">
        {forecast.map((d, i) => {
          const pct = Math.round((d.count / max) * 100);
          const kind = i === 0 ? "due" : "future";
          return (
            <div key={i} className={"fc-day" + (i === 0 ? " today" : "")}>
              <div className="fc-lbl"><strong>{d.short}</strong></div>
              <div className={"fc-bar " + kind} style={{ "--w": pct + "%" }} />
              <div className="fc-count">{String(d.count).padStart(2, " ")}</div>
            </div>
          );
        })}
      </div>
    );
  }
  return (
    <div className="forecast">
      {forecast.map((d, i) => {
        const h = Math.max(8, Math.round((d.count / max) * 100));
        const kind = i === 0 ? "due" : "future";
        return (
          <div key={i} className={"fc-day" + (i === 0 ? " today" : "")}>
            <div className={"fc-bar " + kind} style={{ height: h + "%" }} title={`${d.count} due`} />
            <div className="fc-lbl">
              <strong>{d.count}</strong>
              {d.short.replace(/\s.*$/, "")}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function Dashboard({ dir }) {
  return (
    <div className="dir">
      <Topbar active="dash" />
      <div className="page">
        <div className="dash">

          {/* Eyebrow + title */}
          <div>
            <Eyebrow>PL-200 · Power Platform Functional Consultant</Eyebrow>
            <h1 style={{ marginTop: 6 }}>
              {dir === "editorial" ? "Welcome back. 18 cards are ready." : (dir === "console" ? "18 cards due. Let's go." : "18 cards due today")}
            </h1>
          </div>

          {/* Stats row */}
          <div className="stats">
            <div className="stat">
              <div className="lbl">Attempted</div>
              <div className="v">{PL200.attempted}<span style={{color:"var(--faint)", fontSize:18}}> / {PL200.total}</span></div>
              <div className="sub">{Math.round(PL200.attempted/PL200.total*100)}% of pool</div>
            </div>
            <div className="stat">
              <div className="lbl">Mastered</div>
              <div className="v">{PL200.mastered}</div>
              <div className="sub">last attempt was correct</div>
            </div>
            <div className="stat">
              <div className="lbl">Accuracy</div>
              <div className="v">{PL200.accuracy}%</div>
              <div className="sub">{PL200.lifetimeCorrect}/{PL200.lifetimeAttempts} lifetime</div>
            </div>
            <div className="stat">
              <div className="lbl">Streak</div>
              <div className="v">6<span style={{color:"var(--faint)", fontSize:14, marginLeft:4}}>days</span></div>
              <div className="sub">best · 14 days</div>
            </div>
          </div>

          {/* Due-now hero */}
          <div className="due-now">
            <div className="big">{PL200.dueToday}</div>
            <div>
              <div style={{ fontWeight: 600, fontSize: 15 }}>
                {dir === "editorial" ? "Cards ready to review" : "Cards due now"}
                {PL200.overdue > 0 && (
                  <span className="pill bad" style={{ marginLeft: 10 }}>+{PL200.overdue} overdue</span>
                )}
              </div>
              <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                {dir === "console"
                  ? "// 12 first-time · 6 re-review · longest gap 9d"
                  : "12 first-time · 6 re-review · longest gap 9 days"}
              </div>
            </div>
            <div className="cta-row">
              <button className="btn primary">
                {dir === "console" ? "› start review" : (dir === "editorial" ? "Begin review" : "Start review")}
                <span className="kbd">R</span>
              </button>
              <button className="btn">Custom set</button>
            </div>
          </div>

          {/* Bottom row: CTA + recent */}
          <div className="grid-2" style={{ gridTemplateColumns: "1.05fr 1fr", gap: 18 }}>
            <div className="card">
              <Eyebrow>Quick start</Eyebrow>
              <h2 style={{ marginTop: 4, marginBottom: 12 }}>Take a new exam</h2>
              <div className="stack-sm">
                <div className="row sb"><span className="muted">Length</span><span className="mono">30 questions</span></div>
                <div className="row sb"><span className="muted">Mix</span><span className="mono">due + weak + new</span></div>
                <div className="row sb"><span className="muted">Time limit</span><span className="muted mono">none</span></div>
              </div>
              <div className="cta-row" style={{ marginTop: 18 }}>
                <button className="btn primary">
                  {dir === "console" ? "› start 30q" : "Start 30-question exam"}
                  <span className="kbd">Enter</span>
                </button>
                <button className="btn ghost">Browse all</button>
              </div>
            </div>

            <div className="card">
              <div className="srs-head">
                <h2>Recent runs</h2>
                <a className="muted" style={{ fontSize: 12 }}>{dir === "console" ? "see all →" : "See all"}</a>
              </div>
              <div className="runs" style={{ marginTop: 8 }}>
                {recentRuns.map(r => (
                  <div key={r.id} className="run-row">
                    <span className="when">{r.when}</span>
                    <span className="score">{r.score}/{r.total}</span>
                    <span className={"pct " + (r.pct >= 70 ? "good" : "bad")}>{r.pct}%</span>
                    <span className="muted mono" style={{ fontSize: 11 }}>›</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   3) EXAM RUNNER
   =========================================================== */
function Exam({ dir }) {
  const q = sampleMC;
  const total = 30;
  const cur = 12;
  const answered = 9;

  // Build a 30-cell question map
  const cells = Array.from({ length: total }, (_, i) => {
    const r = (i * 2654435761) % 100 / 100;
    let cls = "";
    if (i === cur - 1) cls = "cur";
    else if (i < cur - 1 && r < 0.7) cls = "done";
    else if (r < 0.05) cls = "flag";
    return { i: i + 1, cls };
  });

  return (
    <div className="dir">
      <Topbar active="exam" />
      <div className="page">
        <div className="exam-shell">
          <aside className="exam-side">
            <Eyebrow>Run · 30 questions</Eyebrow>
            <div className="qmap" style={{ marginTop: 10 }}>
              {cells.map(c => (
                <div key={c.i} className={"cell " + c.cls}>{c.i}</div>
              ))}
            </div>
            <div className="legend">
              <div><span className="pill dot accent" style={{padding:"0 6px"}}>current</span></div>
              <div><span className="pill dot good"   style={{padding:"0 6px"}}>answered</span></div>
              <div><span className="pill dot warn"   style={{padding:"0 6px"}}>flagged</span></div>
            </div>
            <div className="legend" style={{ marginTop: 16, color: "var(--faint)", fontSize: 11 }}>
              <div>↑↓ — navigate</div>
              <div>1–5 — select option</div>
              <div>F — flag for review</div>
              <div>Enter — next</div>
            </div>
          </aside>

          <main className="exam-main">
            <div className="exam-meta">
              <span className="mono">Question {cur}/{total}</span>
              <span className="sep" />
              <span>{q.topic}</span>
              <span className="sep" />
              <span className="mono">{q.id}</span>
              <span style={{ marginLeft: "auto" }} className="row">
                <button className="btn ghost" style={{ padding: "4px 10px", fontSize: 12 }}>Flag <span className="kbd">F</span></button>
              </span>
            </div>
            <div className="progress-line">
              <div className="bar"><i style={{ width: ((cur-1)/total*100) + "%" }} /></div>
              <span className="muted mono" style={{ fontSize: 11 }}>{answered} answered</span>
            </div>

            <div className="stack-sm">
              <div className="qhead">
                <div className="qnum">Question {cur}</div>
                {dir === "editorial" && <div className="muted" style={{ fontSize: 11 }}>est. 1 min</div>}
              </div>
              <div className="qstem" style={{ whiteSpace: "pre-wrap" }}>{q.stem}</div>
            </div>

            <div className="options">
              {q.options.map(o => {
                const cls = "opt " + (o.id === "C" ? "sel" : "");
                return (
                  <label key={o.id} className={cls}>
                    <span className="key">{o.id}</span>
                    <span className="body">{o.text}</span>
                    {o.id === "C" && <span className="pill accent dot" style={{ fontSize: 10 }}>selected</span>}
                  </label>
                );
              })}
            </div>

            <div className="exam-foot">
              <div className="row">
                <button className="btn">← Previous</button>
                <button className="btn">Next →</button>
              </div>
              <div className="row">
                <span className="muted mono" style={{ fontSize: 11 }}>autosaved 2s ago</span>
                <button className="btn primary">{dir === "console" ? "› submit exam" : "Submit exam"}</button>
              </div>
            </div>
          </main>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   4) LIBRARY — grid with topic clusters and SRS-aware filters
   =========================================================== */
function Library({ dir }) {
  const counts = libraryGrid.reduce((acc, q) => { acc[q.status] = (acc[q.status] || 0) + 1; return acc; }, {});
  const due = libraryGrid.filter(q => q.status === "due").length;

  return (
    <div className="dir">
      <Topbar active="library" />
      <div className="page">
        <div className="stack">
          <div className="lib-head">
            <div>
              <Eyebrow>Question library · PL-200</Eyebrow>
              <h1 style={{ marginTop: 6 }}>{dir === "editorial" ? "Every question in the pool" : "All questions"}</h1>
              <p className="muted" style={{ marginTop: 4 }}>
                {counts.ok || 0} mastered · {counts.bad || 0} wrong · {counts.un || 0} unattempted · {due} due
              </p>
            </div>
            <div className="row" style={{ gap: 8 }}>
              <input
                className="btn"
                style={{ background: "var(--surface)", padding: "8px 12px", width: 220, fontSize: 13 }}
                placeholder={dir === "console" ? "/  search…" : "Search questions, topics…"}
              />
              <button className="btn">⌘K</button>
            </div>
          </div>

          <div className="chips">
            {[
              ["all", "All", 240, true],
              ["due", "Due", due, false],
              ["wrong", "Wrong", counts.bad || 0, false],
              ["unattempted", "Unattempted", counts.un || 0, false],
              ["mastered", "Mastered", counts.ok || 0, false],
              ["flagged", "Flagged", 7, false],
            ].map(([k, lbl, c, on]) => (
              <button key={k} className={"chip " + (on ? "on" : "")}>
                {lbl}<span className="c">{c}</span>
              </button>
            ))}
          </div>

          {/* The grid */}
          <div>
            <div className="lib-grid">
              {libraryGrid.slice(0, 200).map(q => {
                const cls = "lib-cell"
                  + (q.status === "ok"  ? " correct" : "")
                  + (q.status === "bad" ? " wrong"   : "")
                  + (q.status === "due" ? " due"     : "")
                  + (q.flag             ? " flag"    : "");
                return <div key={q.id} className={cls} title={`Q-${q.label} · ${q.status}`}>{q.label.slice(1)}</div>;
              })}
            </div>
          </div>

          {/* Topic breakdown */}
          <div className="card" style={{ padding: "18px 22px" }}>
            <div className="srs-head">
              <div>
                <Eyebrow>Coverage by topic</Eyebrow>
                <h2 style={{ marginTop: 4 }}>{dir === "editorial" ? "Where you're strong" : "By topic"}</h2>
              </div>
              <span className="muted mono" style={{ fontSize: 11 }}>sorted by attempts</span>
            </div>
            <div className="topics">
              {topics.map(t => {
                const ok  = Math.round(t.ok/t.total*100);
                const bad = Math.round(t.bad/t.total*100);
                const un  = 100 - ok - bad;
                return (
                  <div key={t.name} className="topic">
                    <div className="name">
                      {t.name}
                      <span className="ct">{t.total} q · {t.ok + t.bad}/{t.total} attempted</span>
                    </div>
                    <div className="meter">
                      {ok  > 0 && <div className="m-correct"     style={{ width: ok  + "%" }}>{ok > 8 && ok + "%"}</div>}
                      {bad > 0 && <div className="m-wrong"       style={{ width: bad + "%" }}>{bad > 8 && bad + "%"}</div>}
                      {un  > 0 && <div className="m-unattempted" style={{ width: un  + "%" }}>{un > 8 && un + "%"}</div>}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   5) PRACTICE — single question, immediate feedback
   =========================================================== */
function Practice({ dir }) {
  const q = sampleMC;
  return (
    <div className="dir">
      <Topbar active="library" />
      <div className="page">
        <div className="practice">
          <div className="practice-head">
            <a className="muted" style={{ fontSize: 12 }}>← All questions</a>
            <span className="muted mono" style={{ fontSize: 11 }}>{q.id} · {q.topic}</span>
          </div>

          <div className="progress-banner">
            <div className="row">
              <span style={{ color: "var(--good)" }}>{dir === "console" ? "[✓]" : "✓"}</span>
              <span>Last attempt correct · 3 attempts</span>
            </div>
            <div className="confbar" style={{ width: 120 }}>
              <i className="c-correct" style={{ width: "67%" }} />
              <i className="c-wrong"   style={{ width: "33%" }} />
            </div>
          </div>

          <div className="stack-sm">
            <div className="qhead">
              <div className="qnum">Practice · single question</div>
              <span className="pill dot accent">due in 2d</span>
            </div>
            <div className="qstem" style={{ whiteSpace: "pre-wrap" }}>{q.stem}</div>
          </div>

          <div className="options">
            {q.options.map(o => {
              const isCorrect = q.correct.includes(o.id);
              const isPicked  = q.selected.includes(o.id);
              let cls = "opt";
              if (isCorrect)              cls += " correct";
              if (isPicked && !isCorrect) cls += " wrong";
              return (
                <label key={o.id} className={cls}>
                  <span className="key">{o.id}</span>
                  <span className="body">{o.text}</span>
                  {isCorrect && <span className="pill good dot" style={{ fontSize: 10 }}>correct</span>}
                </label>
              );
            })}
          </div>

          <div className="verdict-banner ok">
            <div className="ico ok-c">{dir === "console" ? "[✓]" : "✓"}</div>
            <div>
              <div className="ttl">Correct</div>
              <div className="why">Scheduled to reappear in {dir === "editorial" ? "two days" : "2 days"} · current interval 4 → 9 days.</div>
            </div>
            <div className="row">
              <button className="btn">Try again</button>
              <button className="btn primary">Next question →</button>
            </div>
          </div>

          <div className="explain">
            {dir === "editorial" && <span style={{ fontStyle: "normal", fontFamily: "var(--font-display)", fontSize: 28, float: "left", lineHeight: 0.9, marginRight: 8, marginTop: 6, color: "var(--accent)" }}>S</span>}
            {q.explanation}
          </div>
        </div>
      </div>
    </div>
  );
}

/* ===========================================================
   6) RESULTS
   =========================================================== */
function Results({ dir }) {
  const score = 24, total = 30, pct = Math.round(score/total*100);
  const wrong = reviewItems.filter(r => r.verdict === "no").length;
  const skipped = reviewItems.filter(r => r.verdict === "skip").length;
  const correct = reviewItems.filter(r => r.verdict === "ok").length;

  return (
    <div className="dir">
      <Topbar active="results" />
      <div className="page">
        <div className="stack">
          <div className="row sb" style={{ alignItems: "baseline" }}>
            <div>
              <Eyebrow>Exam complete · 23m 14s · {new Date().toLocaleDateString()}</Eyebrow>
              <h1 style={{ marginTop: 6 }}>{dir === "editorial" ? "Nice work." : "Results"}</h1>
            </div>
            <div className="row">
              <button className="btn">{dir === "console" ? "share log" : "Share"}</button>
              <button className="btn primary">{dir === "console" ? "› take another" : "Take another"}</button>
            </div>
          </div>

          <div className={"score-banner " + (pct >= 70 ? "good" : "bad")}>
            <div>
              <div className="muted" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>Score</div>
              <div className="big">{pct}%</div>
              <div className="muted mono" style={{ fontSize: 12, marginTop: 4 }}>{score}/{total} · {pct >= 70 ? "passing" : "below cutoff"}</div>
            </div>
            <div className="breakdown">
              <div>
                <div className="v" style={{ color: "var(--good)" }}>{correct + 20}</div>
                <div className="lbl">Correct</div>
              </div>
              <div>
                <div className="v" style={{ color: "var(--bad)" }}>{wrong + 4}</div>
                <div className="lbl">Wrong</div>
              </div>
              <div>
                <div className="v" style={{ color: "var(--warn)" }}>{skipped + 1}</div>
                <div className="lbl">Skipped</div>
              </div>
            </div>
            <div>
              <div className="muted" style={{ fontSize: 11, letterSpacing: ".1em", textTransform: "uppercase" }}>Cutoff</div>
              <div className="mono" style={{ fontSize: 24, marginTop: 4 }}>70%</div>
              <div className="muted mono" style={{ fontSize: 11, marginTop: 4 }}>{pct - 70 >= 0 ? "+" : ""}{pct - 70} pts</div>
            </div>
          </div>

          {/* Topic accuracy mini chart */}
          <div className="card">
            <div className="srs-head">
              <div>
                <Eyebrow>By topic</Eyebrow>
                <h2 style={{ marginTop: 4 }}>{dir === "editorial" ? "Where it broke down" : "Topic accuracy"}</h2>
              </div>
              <span className="muted mono" style={{ fontSize: 11 }}>this run only</span>
            </div>
            <div className="topics" style={{ marginTop: 14 }}>
              {topics.slice(0, 5).map((t, i) => {
                const got = [86, 100, 75, 50, 60][i];
                return (
                  <div key={t.name} className="topic">
                    <div className="name">
                      {t.name}
                      <span className="ct">{[6,4,4,4,5][i]} questions in this run</span>
                    </div>
                    <div className="meter">
                      <div className="m-correct" style={{ width: got + "%" }}>{got}%</div>
                      {got < 100 && <div className="m-wrong" style={{ width: (100 - got) + "%" }} />}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="row sb" style={{ marginTop: 6 }}>
            <h2>{dir === "editorial" ? "Question review" : "Review"}</h2>
            <div className="chips">
              <button className="chip on">All<span className="c">30</span></button>
              <button className="chip">Wrong<span className="c">5</span></button>
              <button className="chip">Skipped<span className="c">1</span></button>
            </div>
          </div>

          <div className="stack-sm">
            {reviewItems.map((r, i) => (
              <div key={r.qid} className={"review-q " + (r.verdict === "ok" ? "ok" : r.verdict === "no" ? "no" : "skip")}>
                <div className="head">
                  <span>Q{i + 1} · {r.qid} · {r.topic}</span>
                  <span style={{ color: r.verdict === "ok" ? "var(--good)" : r.verdict === "no" ? "var(--bad)" : "var(--warn)" }}>
                    {r.verdict === "ok" ? (dir === "console" ? "[✓] correct" : "✓ Correct") :
                     r.verdict === "no" ? (dir === "console" ? "[✗] wrong" : "✗ Incorrect") :
                                          (dir === "console" ? "[○] skipped" : "○ Skipped")}
                  </span>
                </div>
                <div className="body">{r.stem}</div>
                <div className="ans">
                  Your answer: <b>{r.your}</b>
                  {r.verdict !== "ok" && <>  ·  Correct: <b style={{color: "var(--good)"}}>{r.correct}</b></>}
                </div>
              </div>
            ))}
          </div>

        </div>
      </div>
    </div>
  );
}

Object.assign(window, { Picker, Dashboard, Exam, Library, Practice, Results });
