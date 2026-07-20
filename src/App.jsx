import { useState, useEffect, useMemo } from "react";
import { Plus, Trash2, Flame, Dumbbell, TrendingUp, X, Loader2, ChevronLeft, ChevronRight, Calendar, User, LogOut, Delete, ArrowLeft } from "lucide-react";
import { LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { supabase } from "./supabaseClient";

const FONT_IMPORT = `@import url('https://fonts.googleapis.com/css2?family=Bebas+Neue&family=Inter:wght@400;500;600;700&family=JetBrains+Mono:wght@500;700&display=swap');`;

const COLORS = {
  bg: "#1C1B18",
  surface: "#25231F",
  surfaceRaised: "#2E2B26",
  line: "#3A362F",
  chalk: "#F2EFE7",
  chalkDim: "#B8B2A4",
  iron: "#8A8577",
  plate: "#C0392B",
  plateDim: "#5A2A25",
  chalkBlue: "#5B8FA3",
  chalkBlueDim: "#2C4550",
  gold: "#D4A64A",
};

function todayStr() {
  const d = new Date();
  return d.toISOString().slice(0, 10);
}

function fmtDateLabel(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}

function getWeekDates(offset = 0) {
  const now = new Date();
  const dow = now.getDay(); // 0=Sun..6=Sat
  const offsetFromMonday = (dow + 6) % 7;
  const monday = new Date(now);
  monday.setDate(now.getDate() - offsetFromMonday + offset * 7);
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    return d.toISOString().slice(0, 10);
  });
}

function fmtShort(dateStr) {
  const d = new Date(dateStr + "T00:00:00");
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

function dayMacros(logs, date) {
  const entry = logs[date];
  if (!entry) return { protein: 0, carbs: 0, fat: 0 };
  if (Array.isArray(entry)) {
    return entry.reduce(
      (acc, e) => ({
        protein: acc.protein + Number(e.protein || 0),
        carbs: acc.carbs + Number(e.carbs || 0),
        fat: acc.fat + Number(e.fat || 0),
      }),
      { protein: 0, carbs: 0, fat: 0 }
    );
  }
  return { protein: Number(entry.protein) || 0, carbs: Number(entry.carbs) || 0, fat: Number(entry.fat) || 0 };
}

const WEEKDAY_SHORT = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"];

// ---------- Storage helpers (backed by Supabase, no login required) ----------
async function loadKey(key, fallback) {
  try {
    const { data, error } = await supabase.from("app_data").select("value").eq("key", key).maybeSingle();
    if (error || !data) return fallback;
    return data.value;
  } catch (e) {
    console.error("Storage load failed", key, e);
    return fallback;
  }
}
async function saveKey(key, value) {
  try {
    const { error } = await supabase.from("app_data").upsert({ key, value, updated_at: new Date().toISOString() }, { onConflict: "key" });
    if (error) console.error("Storage save failed", key, error);
  } catch (e) {
    console.error("Storage save failed", key, e);
  }
}

const DEFAULT_MACRO_DATA = {
  targets: { calories: 2400, protein: 160, carbs: 260, fat: 70 },
  logs: {}, // date -> [{id, name, calories, protein, carbs, fat}]
  ratings: {}, // date -> 1-10 how the day/session felt
};
const DEFAULT_WORKOUT_DATA = {
  sessions: [], // {id, date, exercise, sets:[{reps, weight}], day}
  exerciseNames: [],
  dayPlans: [
    { id: "d1", label: "Day 1", exercises: [] },
    { id: "d2", label: "Day 2", exercises: [] },
    { id: "d3", label: "Day 3", exercises: [] },
    { id: "d4", label: "Day 4", exercises: [] },
  ],
};

// ---------- Plate stack visual ----------
function PlateBar({ label, value, target, unit, color, dimColor }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
        <span style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 600, color: COLORS.chalkDim, letterSpacing: 0.5, textTransform: "uppercase" }}>
          {label}
        </span>
        <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 13, color: COLORS.chalk }}>
          {Math.round(value)} <span style={{ color: COLORS.iron }}>/ {target}{unit}</span>
        </span>
      </div>
      <div style={{ height: 10, background: dimColor, borderRadius: 2, overflow: "hidden", position: "relative" }}>
        <div
          style={{
            height: "100%",
            width: `${pct * 100}%`,
            background: color,
            borderRadius: 2,
            transition: "width 0.4s ease",
          }}
        />
      </div>
    </div>
  );
}

// ---------- Macros Tab ----------
function MacrosTab({ macroData, setMacroData }) {
  const weekDates = useMemo(() => getWeekDates(), []);
  const [date, setDate] = useState(() => {
    const t = todayStr();
    return weekDates.includes(t) ? t : weekDates[0];
  });
  const [showTargets, setShowTargets] = useState(false);
  const [targetForm, setTargetForm] = useState(macroData.targets);

  const ratings = macroData.ratings || {};
  const rawEntry = macroData.logs[date];
  const entryObj = rawEntry && !Array.isArray(rawEntry) ? rawEntry : {};

  const protein = Number(entryObj.protein) || 0;
  const carbs = Number(entryObj.carbs) || 0;
  const fat = Number(entryObj.fat) || 0;
  const calories = Math.round(protein * 4 + carbs * 4 + fat * 9);

  function setMacroField(field, value) {
    const nextEntry = { ...entryObj, [field]: value };
    setMacroData({ ...macroData, logs: { ...macroData.logs, [date]: nextEntry } });
  }

  function saveTargets() {
    setMacroData({
      ...macroData,
      targets: {
        calories: Number(targetForm.calories) || 0,
        protein: Number(targetForm.protein) || 0,
        carbs: Number(targetForm.carbs) || 0,
        fat: Number(targetForm.fat) || 0,
      },
    });
    setShowTargets(false);
  }

  function setRating(value) {
    setMacroData({ ...macroData, ratings: { ...ratings, [date]: value } });
  }

  const isToday = date === todayStr();

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: 30, letterSpacing: 1, color: COLORS.chalk, margin: 0 }}>
          WEEKLY BLOCK
        </h2>
        <button
          onClick={() => { setTargetForm(macroData.targets); setShowTargets(true); }}
          style={{ background: "none", border: "none", color: COLORS.iron, fontFamily: "Inter", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
        >
          edit targets
        </button>
      </div>
      <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, marginTop: 0, marginBottom: 14 }}>
        {isToday ? "Today · " : ""}{fmtDateLabel(date)}
      </p>

      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {weekDates.map((d, i) => {
          const dMacros = dayMacros(macroData.logs, d);
          const hasData = dMacros.protein > 0 || dMacros.carbs > 0 || dMacros.fat > 0;
          const rating = ratings[d];
          const selected = d === date;
          const isFuture = d > todayStr();
          return (
            <button
              key={d}
              onClick={() => setDate(d)}
              style={{
                flex: 1,
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: 4,
                padding: "8px 2px",
                background: selected ? COLORS.plateDim : COLORS.surface,
                border: `1px solid ${selected ? COLORS.plate : COLORS.line}`,
                borderRadius: 8,
                cursor: "pointer",
                opacity: isFuture ? 0.5 : 1,
              }}
            >
              <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: selected ? COLORS.chalk : COLORS.iron, textTransform: "uppercase" }}>
                {WEEKDAY_SHORT[i]}
              </span>
              <span style={{ width: 6, height: 6, borderRadius: "50%", background: hasData ? COLORS.chalkBlue : COLORS.line }} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: rating ? COLORS.gold : COLORS.iron }}>
                {rating || "–"}
              </span>
            </button>
          );
        })}
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 18, marginBottom: 20 }}>
        <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 18 }}>
          <Flame size={20} color={COLORS.plate} />
          <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: COLORS.chalk }}>
            {calories}
          </span>
          <span style={{ fontFamily: "Inter", fontSize: 14, color: COLORS.iron }}>
            / {macroData.targets.calories} kcal
          </span>
        </div>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 18 }}>
          <FieldRow label="Protein (g)">
            <TextInput value={entryObj.protein ?? ""} onChange={(v) => setMacroField("protein", v)} numeric />
          </FieldRow>
          <FieldRow label="Carbs (g)">
            <TextInput value={entryObj.carbs ?? ""} onChange={(v) => setMacroField("carbs", v)} numeric />
          </FieldRow>
          <FieldRow label="Fat (g)">
            <TextInput value={entryObj.fat ?? ""} onChange={(v) => setMacroField("fat", v)} numeric />
          </FieldRow>
        </div>

        <PlateBar label="Protein" value={protein} target={macroData.targets.protein} unit="g" color={COLORS.plate} dimColor={COLORS.plateDim} />
        <PlateBar label="Carbs" value={carbs} target={macroData.targets.carbs} unit="g" color={COLORS.chalkBlue} dimColor={COLORS.chalkBlueDim} />
        <PlateBar label="Fat" value={fat} target={macroData.targets.fat} unit="g" color={COLORS.gold} dimColor="#4A3C22" />
      </div>

      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 16 }}>
        <h3 style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.chalkDim, margin: "0 0 10px" }}>
          How did this day feel?
        </h3>
        <div style={{ display: "flex", gap: 5 }}>
          {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => {
            const active = ratings[date] === n;
            return (
              <button
                key={n}
                onClick={() => setRating(n)}
                style={{
                  flex: 1,
                  aspectRatio: "1",
                  borderRadius: 6,
                  border: `1px solid ${active ? COLORS.gold : COLORS.line}`,
                  background: active ? COLORS.gold : COLORS.bg,
                  color: active ? COLORS.bg : COLORS.chalkDim,
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: "pointer",
                }}
              >
                {n}
              </button>
            );
          })}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4 }}>
          <span style={{ fontFamily: "Inter", fontSize: 10, color: COLORS.iron }}>Rough</span>
          <span style={{ fontFamily: "Inter", fontSize: 10, color: COLORS.iron }}>On fire</span>
        </div>
      </div>

      {showTargets && (
        <Modal onClose={() => setShowTargets(false)} title="Daily targets">
          <FieldRow label="Calories"><TextInput value={targetForm.calories} onChange={(v) => setTargetForm({ ...targetForm, calories: v })} numeric /></FieldRow>
          <FieldRow label="Protein (g)"><TextInput value={targetForm.protein} onChange={(v) => setTargetForm({ ...targetForm, protein: v })} numeric /></FieldRow>
          <FieldRow label="Carbs (g)"><TextInput value={targetForm.carbs} onChange={(v) => setTargetForm({ ...targetForm, carbs: v })} numeric /></FieldRow>
          <FieldRow label="Fat (g)"><TextInput value={targetForm.fat} onChange={(v) => setTargetForm({ ...targetForm, fat: v })} numeric /></FieldRow>
          <PrimaryButton onClick={saveTargets} label="Save targets" />
        </Modal>
      )}
    </div>
  );
}

// ---------- Workouts Tab ----------
function DayPlanBox({ plan, onChange, onLogExercise }) {
  const [newExercise, setNewExercise] = useState("");

  function addExercise() {
    const name = newExercise.trim();
    if (!name || plan.exercises.includes(name)) { setNewExercise(""); return; }
    onChange({ ...plan, exercises: [...plan.exercises, name] });
    setNewExercise("");
  }
  function removeExercise(name) {
    onChange({ ...plan, exercises: plan.exercises.filter((e) => e !== name) });
  }

  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 14 }}>
      <input
        value={plan.label}
        onChange={(e) => onChange({ ...plan, label: e.target.value })}
        placeholder="Label this day"
        style={{
          width: "100%",
          background: "transparent",
          border: "none",
          borderBottom: `1px solid ${COLORS.line}`,
          color: COLORS.chalk,
          fontFamily: "'Bebas Neue'",
          fontSize: 20,
          letterSpacing: 0.5,
          padding: "0 0 6px",
          marginBottom: 10,
        }}
      />

      {plan.exercises.length === 0 && (
        <p style={{ fontFamily: "Inter", fontSize: 12, color: COLORS.iron, fontStyle: "italic", margin: "0 0 8px" }}>
          No exercises yet
        </p>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
        {plan.exercises.map((ex) => (
          <div key={ex} style={{ display: "flex", alignItems: "center", justifyContent: "space-between", background: COLORS.surfaceRaised, borderRadius: 6, padding: "6px 8px" }}>
            <button
              onClick={() => onLogExercise(plan, ex)}
              style={{ background: "none", border: "none", color: COLORS.chalkDim, fontFamily: "Inter", fontSize: 13, fontWeight: 600, cursor: "pointer", textAlign: "left", flex: 1 }}
            >
              {ex}
            </button>
            <button onClick={() => removeExercise(ex)} style={{ background: "none", border: "none", color: COLORS.iron, cursor: "pointer", padding: "0 0 0 8px" }}>
              <X size={13} />
            </button>
          </div>
        ))}
      </div>

      <div style={{ display: "flex", gap: 6 }}>
        <input
          value={newExercise}
          onChange={(e) => setNewExercise(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter") addExercise(); }}
          placeholder="Add exercise"
          style={{ flex: 1, background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "6px 8px", color: COLORS.chalk, fontFamily: "Inter", fontSize: 12 }}
        />
        <button onClick={addExercise} style={{ background: COLORS.plateDim, border: "none", borderRadius: 6, padding: "0 10px", color: COLORS.chalk, cursor: "pointer" }}>
          <Plus size={14} />
        </button>
      </div>

      <button
        onClick={() => onLogExercise(plan, "")}
        style={{ width: "100%", marginTop: 10, background: "none", border: `1px solid ${COLORS.line}`, color: COLORS.chalkDim, borderRadius: 6, padding: "7px 0", fontFamily: "Inter", fontSize: 12, fontWeight: 600, cursor: "pointer" }}
      >
        Log {plan.label || "this day"}
      </button>
    </div>
  );
}

function WorkoutsTab({ workoutData, setWorkoutData }) {
  const [showLog, setShowLog] = useState(false);
  const [exercise, setExercise] = useState("");
  const [sets, setSets] = useState([{ reps: "", weight: "" }]);
  const [logDay, setLogDay] = useState("");

  const dayPlans = workoutData.dayPlans || DEFAULT_WORKOUT_DATA.dayPlans;

  function updateDayPlan(updatedPlan) {
    setWorkoutData({
      ...workoutData,
      dayPlans: dayPlans.map((p) => (p.id === updatedPlan.id ? updatedPlan : p)),
    });
  }

  function openLogModal(plan, exerciseName) {
    setLogDay(plan ? plan.id : "");
    setExercise(exerciseName || "");
    setSets([{ reps: "", weight: "" }]);
    setShowLog(true);
  }

  const sessionsByDate = useMemo(() => {
    const grouped = {};
    [...workoutData.sessions]
      .sort((a, b) => (a.date < b.date ? 1 : -1))
      .forEach((s) => {
        grouped[s.date] = grouped[s.date] || [];
        grouped[s.date].push(s);
      });
    return grouped;
  }, [workoutData.sessions]);

  function addSetRow() {
    setSets([...sets, { reps: "", weight: "" }]);
  }
  function updateSet(i, field, value) {
    const next = [...sets];
    next[i] = { ...next[i], [field]: value };
    setSets(next);
  }
  function removeSetRow(i) {
    setSets(sets.filter((_, idx) => idx !== i));
  }

  function saveSession() {
    if (!exercise.trim()) return;
    const cleanSets = sets
      .filter((s) => s.reps !== "" || s.weight !== "")
      .map((s) => ({ reps: Number(s.reps) || 0, weight: Number(s.weight) || 0 }));
    if (cleanSets.length === 0) return;
    const plan = dayPlans.find((p) => p.id === logDay);
    const session = { id: Date.now().toString(), date: todayStr(), exercise: exercise.trim(), sets: cleanSets, day: plan ? plan.label : null };
    const names = new Set(workoutData.exerciseNames);
    names.add(exercise.trim());
    setWorkoutData({
      ...workoutData,
      sessions: [...workoutData.sessions, session],
      exerciseNames: Array.from(names),
    });
    setExercise("");
    setSets([{ reps: "", weight: "" }]);
    setLogDay("");
    setShowLog(false);
  }

  function deleteSession(id) {
    setWorkoutData({ ...workoutData, sessions: workoutData.sessions.filter((s) => s.id !== id) });
  }

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 20 }}>
        <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: 30, letterSpacing: 1, color: COLORS.chalk, margin: 0 }}>
          WORKOUT LOG
        </h2>
        <button
          onClick={() => openLogModal(null, "")}
          style={{ display: "flex", alignItems: "center", gap: 4, background: COLORS.plate, color: COLORS.chalk, border: "none", borderRadius: 6, padding: "6px 12px", fontFamily: "Inter", fontWeight: 600, fontSize: 13, cursor: "pointer" }}
        >
          <Plus size={14} /> Log set
        </button>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 24 }}>
        {dayPlans.map((plan) => (
          <DayPlanBox key={plan.id} plan={plan} onChange={updateDayPlan} onLogExercise={openLogModal} />
        ))}
      </div>

      {Object.keys(sessionsByDate).length === 0 && (
        <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, fontStyle: "italic" }}>No sessions logged yet.</p>
      )}

      {Object.entries(sessionsByDate).map(([date, sessions]) => (
        <div key={date} style={{ marginBottom: 20 }}>
          <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.iron, marginBottom: 8 }}>
            {fmtDateLabel(date)}
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {sessions.map((s) => (
              <div key={s.id} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "10px 12px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                  <div>
                    <div style={{ fontFamily: "Inter", fontWeight: 600, fontSize: 14, color: COLORS.chalk }}>{s.exercise}</div>
                    {s.day && (
                      <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.4, color: COLORS.plate }}>{s.day}</span>
                    )}
                  </div>
                  <button onClick={() => deleteSession(s.id)} style={{ background: "none", border: "none", cursor: "pointer", color: COLORS.iron }}>
                    <Trash2 size={15} />
                  </button>
                </div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginTop: 6 }}>
                  {s.sets.map((set, i) => (
                    <span key={i} style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.chalkDim, background: COLORS.surfaceRaised, borderRadius: 4, padding: "2px 8px" }}>
                      {set.reps}×{set.weight}
                    </span>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}

      {showLog && (
        <Modal onClose={() => { setShowLog(false); setLogDay(""); }} title="Log a set">
          <FieldRow label="Day">
            <select
              value={logDay}
              onChange={(e) => setLogDay(e.target.value)}
              style={{ width: "100%", background: COLORS.bg, border: `1px solid ${COLORS.line}`, borderRadius: 6, padding: "8px 10px", color: COLORS.chalk, fontFamily: "Inter", fontSize: 14 }}
            >
              <option value="">No day</option>
              {dayPlans.map((p) => (
                <option key={p.id} value={p.id}>{p.label}</option>
              ))}
            </select>
          </FieldRow>
          <FieldRow label="Exercise">
            <TextInput value={exercise} onChange={setExercise} placeholder="Back squat" autoFocus list="exercise-list" />
            <datalist id="exercise-list">
              {workoutData.exerciseNames.map((n) => <option key={n} value={n} />)}
            </datalist>
          </FieldRow>
          <div style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: COLORS.chalkDim, textTransform: "uppercase", letterSpacing: 0.5, margin: "10px 0 6px" }}>
            Sets
          </div>
          {sets.map((s, i) => (
            <div key={i} style={{ display: "flex", gap: 8, marginBottom: 8, alignItems: "center" }}>
              <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.iron, width: 16 }}>{i + 1}</div>
              <TextInput value={s.reps} onChange={(v) => updateSet(i, "reps", v)} placeholder="reps" numeric small />
              <span style={{ color: COLORS.iron, fontFamily: "Inter" }}>×</span>
              <TextInput value={s.weight} onChange={(v) => updateSet(i, "weight", v)} placeholder="weight" numeric small />
              {sets.length > 1 && (
                <button onClick={() => removeSetRow(i)} style={{ background: "none", border: "none", color: COLORS.iron, cursor: "pointer" }}>
                  <X size={15} />
                </button>
              )}
            </div>
          ))}
          <button onClick={addSetRow} style={{ background: "none", border: `1px dashed ${COLORS.line}`, color: COLORS.chalkDim, borderRadius: 6, padding: "6px 10px", fontFamily: "Inter", fontSize: 12, cursor: "pointer", marginBottom: 14 }}>
            + add set
          </button>
          <PrimaryButton onClick={saveSession} label="Save session" />
        </Modal>
      )}
    </div>
  );
}

// ---------- Progress Tab ----------
function ProgressTab({ workoutData }) {
  const exerciseNames = workoutData.exerciseNames;
  const [selected, setSelected] = useState(exerciseNames[0] || "");

  useEffect(() => {
    if (!selected && exerciseNames.length > 0) setSelected(exerciseNames[0]);
  }, [exerciseNames]);

  const chartData = useMemo(() => {
    return workoutData.sessions
      .filter((s) => s.exercise === selected)
      .sort((a, b) => (a.date > b.date ? 1 : -1))
      .map((s) => ({
        date: s.date,
        label: fmtDateLabel(s.date).replace(/^\w+, /, ""),
        topWeight: Math.max(...s.sets.map((x) => x.weight)),
        volume: s.sets.reduce((sum, x) => sum + x.reps * x.weight, 0),
      }));
  }, [workoutData.sessions, selected]);

  const pr = chartData.length ? Math.max(...chartData.map((d) => d.topWeight)) : 0;

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: 30, letterSpacing: 1, color: COLORS.chalk, margin: "0 0 20px" }}>
        PROGRESS
      </h2>

      {exerciseNames.length === 0 ? (
        <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, fontStyle: "italic" }}>
          Log a few sessions to see progress here.
        </p>
      ) : (
        <>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 18 }}>
            {exerciseNames.map((n) => (
              <button
                key={n}
                onClick={() => setSelected(n)}
                style={{
                  fontFamily: "Inter",
                  fontSize: 12,
                  fontWeight: 600,
                  padding: "6px 12px",
                  borderRadius: 20,
                  cursor: "pointer",
                  border: `1px solid ${selected === n ? COLORS.plate : COLORS.line}`,
                  background: selected === n ? COLORS.plateDim : "transparent",
                  color: selected === n ? COLORS.chalk : COLORS.chalkDim,
                }}
              >
                {n}
              </button>
            ))}
          </div>

          {chartData.length === 0 ? (
            <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, fontStyle: "italic" }}>No data for this exercise yet.</p>
          ) : (
            <>
              <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: "16px 8px 8px", marginBottom: 16 }}>
                <div style={{ display: "flex", alignItems: "baseline", gap: 8, padding: "0 12px 10px" }}>
                  <TrendingUp size={16} color={COLORS.plate} />
                  <span style={{ fontFamily: "Inter", fontSize: 12, color: COLORS.iron, textTransform: "uppercase", letterSpacing: 0.5 }}>Best lift</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: COLORS.chalk }}>{pr}</span>
                </div>
                <ResponsiveContainer width="100%" height={200}>
                  <LineChart data={chartData} margin={{ top: 5, right: 16, bottom: 0, left: -20 }}>
                    <CartesianGrid stroke={COLORS.line} strokeDasharray="3 3" />
                    <XAxis dataKey="label" tick={{ fill: COLORS.iron, fontSize: 10, fontFamily: "Inter" }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
                    <YAxis tick={{ fill: COLORS.iron, fontSize: 10, fontFamily: "Inter" }} axisLine={{ stroke: COLORS.line }} tickLine={false} />
                    <Tooltip
                      contentStyle={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderRadius: 6, fontFamily: "Inter", fontSize: 12 }}
                      labelStyle={{ color: COLORS.chalk }}
                      itemStyle={{ color: COLORS.plate }}
                    />
                    <Line type="monotone" dataKey="topWeight" stroke={COLORS.plate} strokeWidth={2.5} dot={{ r: 3, fill: COLORS.plate }} name="Top weight" />
                  </LineChart>
                </ResponsiveContainer>
              </div>

              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {[...chartData].reverse().map((d, i) => (
                  <div key={i} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.chalkDim, borderBottom: `1px solid ${COLORS.line}`, padding: "6px 2px" }}>
                    <span>{d.label}</span>
                    <span>top {d.topWeight} · vol {d.volume}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </>
      )}
    </div>
  );
}

// ---------- Weekly Review Tab ----------
function ReviewTab({ macroData, workoutData }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const weekDates = useMemo(() => getWeekDates(weekOffset), [weekOffset]);
  const ratings = macroData.ratings || {};

  const dayStats = weekDates.map((d) => {
    const m = dayMacros(macroData.logs, d);
    const calories = Math.round(m.protein * 4 + m.carbs * 4 + m.fat * 9);
    const hasData = m.protein > 0 || m.carbs > 0 || m.fat > 0;
    return { date: d, totals: { ...m, calories }, rating: ratings[d], hasData };
  });
  const loggedDays = dayStats.filter((d) => d.hasData);
  const avg = (key) =>
    loggedDays.length ? Math.round(loggedDays.reduce((s, d) => s + d.totals[key], 0) / loggedDays.length) : 0;
  const ratedDays = dayStats.filter((d) => d.rating);
  const avgRating = ratedDays.length ? (ratedDays.reduce((s, d) => s + d.rating, 0) / ratedDays.length).toFixed(1) : null;

  const weekSessions = workoutData.sessions.filter((s) => weekDates.includes(s.date));
  const sessionsByDay = {};
  weekSessions.forEach((s) => {
    const label = s.day || "Unassigned";
    sessionsByDay[label] = (sessionsByDay[label] || 0) + 1;
  });
  const exerciseBests = {};
  weekSessions.forEach((s) => {
    const top = Math.max(...s.sets.map((x) => x.weight));
    if (exerciseBests[s.exercise] === undefined || top > exerciseBests[s.exercise]) {
      exerciseBests[s.exercise] = top;
    }
  });

  const isCurrentWeek = weekOffset === 0;

  return (
    <div style={{ padding: "16px 16px 90px" }}>
      <h2 style={{ fontFamily: "'Bebas Neue'", fontSize: 30, letterSpacing: 1, color: COLORS.chalk, margin: "0 0 16px" }}>
        WEEKLY REVIEW
      </h2>

      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 18 }}>
        <button onClick={() => setWeekOffset(weekOffset - 1)} style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 8, color: COLORS.chalk, cursor: "pointer" }}>
          <ChevronLeft size={18} />
        </button>
        <div style={{ textAlign: "center" }}>
          <div style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 700, color: COLORS.chalk }}>
            {fmtShort(weekDates[0])} – {fmtShort(weekDates[6])}
          </div>
          <div style={{ fontFamily: "Inter", fontSize: 11, color: COLORS.iron }}>{isCurrentWeek ? "This week" : "Past week"}</div>
        </div>
        <button
          onClick={() => setWeekOffset(weekOffset + 1)}
          disabled={isCurrentWeek}
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: 8, color: isCurrentWeek ? COLORS.line : COLORS.chalk, cursor: isCurrentWeek ? "default" : "pointer" }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      {/* Day-by-day strip */}
      <div style={{ display: "flex", gap: 6, marginBottom: 20 }}>
        {dayStats.map((d, i) => (
          <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, padding: "8px 2px", background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8 }}>
            <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 700, letterSpacing: 0.5, color: COLORS.iron, textTransform: "uppercase" }}>
              {WEEKDAY_SHORT[i]}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, color: d.hasData ? COLORS.chalk : COLORS.iron }}>
              {d.hasData ? Math.round(d.totals.calories) : "–"}
            </span>
            <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 11, fontWeight: 700, color: d.rating ? COLORS.gold : COLORS.iron }}>
              {d.rating || "–"}
            </span>
          </div>
        ))}
      </div>

      {/* Macro summary */}
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 18, marginBottom: 16 }}>
        <h3 style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.chalkDim, margin: "0 0 14px" }}>
          Daily average {loggedDays.length > 0 && <span style={{ color: COLORS.iron, fontWeight: 400, textTransform: "none" }}>· {loggedDays.length}/7 days logged</span>}
        </h3>
        {loggedDays.length === 0 ? (
          <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, fontStyle: "italic", margin: 0 }}>No food logged this week.</p>
        ) : (
          <>
            <div style={{ display: "flex", alignItems: "baseline", gap: 8, marginBottom: 16 }}>
              <Flame size={20} color={COLORS.plate} />
              <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 26, fontWeight: 700, color: COLORS.chalk }}>{avg("calories")}</span>
              <span style={{ fontFamily: "Inter", fontSize: 14, color: COLORS.iron }}>/ {macroData.targets.calories} kcal avg</span>
            </div>
            <PlateBar label="Protein" value={avg("protein")} target={macroData.targets.protein} unit="g" color={COLORS.plate} dimColor={COLORS.plateDim} />
            <PlateBar label="Carbs" value={avg("carbs")} target={macroData.targets.carbs} unit="g" color={COLORS.chalkBlue} dimColor={COLORS.chalkBlueDim} />
            <PlateBar label="Fat" value={avg("fat")} target={macroData.targets.fat} unit="g" color={COLORS.gold} dimColor="#4A3C22" />
          </>
        )}
        {avgRating && (
          <div style={{ marginTop: 4, fontFamily: "Inter", fontSize: 12, color: COLORS.chalkDim }}>
            Avg how-it-felt rating: <span style={{ color: COLORS.gold, fontWeight: 700, fontFamily: "'JetBrains Mono', monospace" }}>{avgRating}/10</span>
          </div>
        )}
      </div>

      {/* Training summary */}
      <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 10, padding: 18 }}>
        <h3 style={{ fontFamily: "Inter", fontSize: 13, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.chalkDim, margin: "0 0 12px" }}>
          Training
        </h3>
        {weekSessions.length === 0 ? (
          <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, fontStyle: "italic", margin: 0 }}>No sessions logged this week.</p>
        ) : (
          <>
            <div style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.chalk, marginBottom: 10 }}>
              <strong style={{ fontFamily: "'JetBrains Mono', monospace" }}>{weekSessions.length}</strong> session{weekSessions.length === 1 ? "" : "s"} logged
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 14 }}>
              {Object.entries(sessionsByDay).map(([label, count]) => (
                <span key={label} style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: COLORS.chalkDim, background: COLORS.surfaceRaised, borderRadius: 20, padding: "4px 10px" }}>
                  {label} × {count}
                </span>
              ))}
            </div>
            <div style={{ fontFamily: "Inter", fontSize: 11, fontWeight: 700, letterSpacing: 0.5, textTransform: "uppercase", color: COLORS.iron, marginBottom: 6 }}>
              Top lifts this week
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>
              {Object.entries(exerciseBests).map(([name, weight]) => (
                <div key={name} style={{ display: "flex", justifyContent: "space-between", fontFamily: "'JetBrains Mono', monospace", fontSize: 12, color: COLORS.chalkDim, borderBottom: `1px solid ${COLORS.line}`, padding: "5px 2px" }}>
                  <span>{name}</span>
                  <span style={{ color: COLORS.chalk }}>{weight}</span>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ---------- Shared UI bits ----------
function Modal({ title, children, onClose }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "flex-end", justifyContent: "center", zIndex: 50 }} onClick={onClose}>
      <div
        onClick={(e) => e.stopPropagation()}
        style={{ background: COLORS.surfaceRaised, border: `1px solid ${COLORS.line}`, borderRadius: "14px 14px 0 0", padding: 20, width: "100%", maxWidth: 480, maxHeight: "85vh", overflowY: "auto" }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
          <h3 style={{ fontFamily: "'Bebas Neue'", fontSize: 22, letterSpacing: 0.5, color: COLORS.chalk, margin: 0 }}>{title}</h3>
          <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.iron, cursor: "pointer" }}>
            <X size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

function FieldRow({ label, children }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: "block", fontFamily: "Inter", fontSize: 11, fontWeight: 600, textTransform: "uppercase", letterSpacing: 0.5, color: COLORS.iron, marginBottom: 4 }}>
        {label}
      </label>
      {children}
    </div>
  );
}

function TextInput({ value, onChange, placeholder, numeric, autoFocus, small, list }) {
  return (
    <input
      type={numeric ? "number" : "text"}
      inputMode={numeric ? "decimal" : undefined}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      autoFocus={autoFocus}
      list={list}
      style={{
        width: small ? 70 : "100%",
        background: COLORS.bg,
        border: `1px solid ${COLORS.line}`,
        borderRadius: 6,
        padding: "8px 10px",
        color: COLORS.chalk,
        fontFamily: "Inter",
        fontSize: 14,
        boxSizing: "border-box",
      }}
    />
  );
}

function PrimaryButton({ onClick, label }) {
  return (
    <button
      onClick={onClick}
      style={{ width: "100%", background: COLORS.plate, color: COLORS.chalk, border: "none", borderRadius: 8, padding: "12px", fontFamily: "Inter", fontWeight: 700, fontSize: 14, cursor: "pointer", marginTop: 6 }}
    >
      {label}
    </button>
  );
}

// ---------- Root App ----------
// ---------- Sign-in screen (real name + password, via Supabase Auth) ----------
function nameToEmail(name) {
  const slug = name.trim().toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
  return `${slug}@ironlog.app`;
}

const PIN_LENGTH = 6;

function PinPad({ onDigit, onBackspace, disabled }) {
  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "back"];
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, width: "100%", maxWidth: 280, margin: "0 auto" }}>
      {keys.map((k, i) => {
        if (k === "") return <div key={i} />;
        if (k === "back") {
          return (
            <button
              key={i}
              onClick={onBackspace}
              disabled={disabled}
              style={{ aspectRatio: "1", borderRadius: "50%", border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.chalkDim, display: "flex", alignItems: "center", justifyContent: "center", cursor: disabled ? "default" : "pointer" }}
            >
              <Delete size={20} />
            </button>
          );
        }
        return (
          <button
            key={i}
            onClick={() => onDigit(k)}
            disabled={disabled}
            style={{ aspectRatio: "1", borderRadius: "50%", border: `1px solid ${COLORS.line}`, background: COLORS.surface, color: COLORS.chalk, fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, cursor: disabled ? "default" : "pointer" }}
          >
            {k}
          </button>
        );
      })}
    </div>
  );
}

function PinDots({ length, filled, error }) {
  return (
    <div style={{ display: "flex", gap: 14, justifyContent: "center", marginBottom: 30 }}>
      {Array.from({ length }, (_, i) => (
        <div
          key={i}
          style={{
            width: 14,
            height: 14,
            borderRadius: "50%",
            border: `1px solid ${error ? COLORS.plate : COLORS.line}`,
            background: i < filled ? (error ? COLORS.plate : COLORS.gold) : "transparent",
            transition: "background 0.15s ease",
          }}
        />
      ))}
    </div>
  );
}

function AuthScreen({ onAuthed }) {
  const [step, setStep] = useState("name"); // "name" | "pin"
  const [name, setName] = useState("");
  const [mode, setMode] = useState("login"); // "login" | "signup"
  const [pin, setPin] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(pinValue) {
    const trimmedName = name.trim();
    setBusy(true);
    setError("");
    const email = nameToEmail(trimmedName);

    if (mode === "signup") {
      const { data, error: signUpError } = await supabase.auth.signUp({
        email,
        password: pinValue,
        options: { data: { display_name: trimmedName } },
      });
      if (signUpError) {
        setError(signUpError.message.includes("already registered") ? "That name is taken. Try logging in instead." : signUpError.message);
        setPin("");
        setBusy(false);
        return;
      }
      if (data.session) onAuthed(data.session);
      else {
        setError("Account created. Log in with your PIN.");
        setMode("login");
        setPin("");
      }
    } else {
      const { data, error: signInError } = await supabase.auth.signInWithPassword({ email, password: pinValue });
      if (signInError) {
        setError("Wrong name or PIN.");
        setPin("");
        setBusy(false);
        return;
      }
      onAuthed(data.session);
    }
    setBusy(false);
  }

  useEffect(() => {
    if (pin.length === PIN_LENGTH && step === "pin" && !busy) {
      submit(pin);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pin]);

  function pressDigit(d) {
    if (pin.length >= PIN_LENGTH || busy) return;
    setError("");
    setPin(pin + d);
  }
  function backspace() {
    if (busy) return;
    setPin(pin.slice(0, -1));
  }
  function goToPin() {
    setPin("");
    setError("");
    setStep("pin");
  }
  function backToName() {
    setStep("name");
    setPin("");
    setError("");
  }

  if (step === "name") {
    return (
      <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
        <div style={{ textAlign: "center", marginBottom: 28 }}>
          <Dumbbell size={30} color={COLORS.plate} style={{ marginBottom: 8 }} />
          <h1 style={{ fontFamily: "'Bebas Neue'", fontSize: 34, letterSpacing: 1, color: COLORS.chalk, margin: 0 }}>
            IRON LOG
          </h1>
          <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, margin: "4px 0 0" }}>
            {mode === "login" ? "Log in to see your own macros, workouts, and progress." : "Create an account to get started."}
          </p>
        </div>

        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => { if (e.key === "Enter" && name.trim()) goToPin(); }}
          placeholder="Name"
          autoFocus
          style={{ background: COLORS.surface, border: `1px solid ${COLORS.line}`, borderRadius: 8, padding: "12px 14px", color: COLORS.chalk, fontFamily: "Inter", fontSize: 14, marginBottom: 12, outline: "none" }}
        />

        <button
          onClick={goToPin}
          disabled={!name.trim()}
          style={{ background: COLORS.plate, color: COLORS.chalk, border: "none", borderRadius: 8, padding: "12px", fontFamily: "Inter", fontWeight: 700, fontSize: 14, cursor: name.trim() ? "pointer" : "default", opacity: name.trim() ? 1 : 0.5, marginBottom: 12 }}
        >
          Continue
        </button>

        <button
          onClick={() => setMode(mode === "login" ? "signup" : "login")}
          style={{ background: "none", border: "none", color: COLORS.iron, fontFamily: "Inter", fontSize: 12, textDecoration: "underline", cursor: "pointer" }}
        >
          {mode === "login" ? "New here? Create an account" : "Already have an account? Log in"}
        </button>
      </div>
    );
  }

  return (
    <div style={{ minHeight: "100vh", display: "flex", flexDirection: "column", justifyContent: "center", padding: 24 }}>
      <button
        onClick={backToName}
        style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: COLORS.iron, fontFamily: "Inter", fontSize: 12, cursor: "pointer", marginBottom: 20, alignSelf: "flex-start" }}
      >
        <ArrowLeft size={14} /> Back
      </button>

      <div style={{ textAlign: "center", marginBottom: 24 }}>
        <User size={22} color={COLORS.chalkDim} style={{ marginBottom: 6 }} />
        <div style={{ fontFamily: "Inter", fontSize: 14, fontWeight: 600, color: COLORS.chalk }}>{name.trim()}</div>
        <p style={{ fontFamily: "Inter", fontSize: 12, color: COLORS.iron, margin: "6px 0 0" }}>
          {mode === "login" ? "Enter your PIN" : `Choose a ${PIN_LENGTH}-digit PIN`}
        </p>
      </div>

      <PinDots length={PIN_LENGTH} filled={pin.length} error={!!error} />

      {error && (
        <p style={{ fontFamily: "Inter", fontSize: 12, color: COLORS.plate, textAlign: "center", marginTop: -18, marginBottom: 18 }}>{error}</p>
      )}

      {busy ? (
        <p style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron, textAlign: "center" }}>Checking…</p>
      ) : (
        <PinPad onDigit={pressDigit} onBackspace={backspace} disabled={busy} />
      )}
    </div>
  );
}

export default function App() {
  const [tab, setTab] = useState("macros");
  const [session, setSession] = useState(null);
  const [sessionChecked, setSessionChecked] = useState(false);
  const [macroData, setMacroData] = useState(DEFAULT_MACRO_DATA);
  const [workoutData, setWorkoutData] = useState(DEFAULT_WORKOUT_DATA);
  const [dataLoaded, setDataLoaded] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setSessionChecked(true);
    });
    const { data: listener } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(newSession);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!session) { setDataLoaded(false); return; }
    (async () => {
      setDataLoaded(false);
      const [m, w] = await Promise.all([
        loadKey("macro-data", DEFAULT_MACRO_DATA),
        loadKey("workout-data", DEFAULT_WORKOUT_DATA),
      ]);
      setMacroData(m);
      setWorkoutData(w);
      setDataLoaded(true);
    })();
  }, [session]);

  async function logout() {
    await supabase.auth.signOut();
    setTab("macros");
  }

  useEffect(() => { if (dataLoaded && session) saveKey("macro-data", macroData); }, [macroData, dataLoaded, session]);
  useEffect(() => { if (dataLoaded && session) saveKey("workout-data", workoutData); }, [workoutData, dataLoaded, session]);

  const displayName = session?.user?.user_metadata?.display_name || "";

  const tabs = [
    { id: "macros", label: "Macros", icon: Flame },
    { id: "workouts", label: "Workouts", icon: Dumbbell },
    { id: "progress", label: "Progress", icon: TrendingUp },
    { id: "review", label: "Review", icon: Calendar },
  ];

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, fontFamily: "Inter" }}>
      <style>{FONT_IMPORT}{`
        * { box-sizing: border-box; }
        input::placeholder { color: ${COLORS.iron}; opacity: 0.7; }
        input:focus { outline: none; border-color: ${COLORS.plate} !important; }
      `}</style>

      {!sessionChecked ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 10 }}>
          <Loader2 size={22} color={COLORS.plate} style={{ animation: "spin 1s linear infinite" }} />
          <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
        </div>
      ) : !session ? (
        <AuthScreen onAuthed={setSession} />
      ) : !dataLoaded ? (
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", gap: 10 }}>
          <Loader2 size={22} color={COLORS.plate} style={{ animation: "spin 1s linear infinite" }} />
          <span style={{ fontFamily: "Inter", fontSize: 13, color: COLORS.iron }}>Loading your data…</span>
          <style>{`@keyframes spin { from { transform: rotate(0deg);} to { transform: rotate(360deg);} }`}</style>
        </div>
      ) : (
        <>
          <div style={{ maxWidth: 480, margin: "0 auto" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", padding: "14px 16px 0" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <User size={14} color={COLORS.iron} />
                <span style={{ fontFamily: "Inter", fontSize: 12, fontWeight: 600, color: COLORS.chalkDim }}>{displayName}</span>
              </div>
              <button
                onClick={logout}
                style={{ display: "flex", alignItems: "center", gap: 4, background: "none", border: "none", color: COLORS.iron, fontFamily: "Inter", fontSize: 12, cursor: "pointer" }}
              >
                <LogOut size={13} /> Log out
              </button>
            </div>
            {tab === "macros" && <MacrosTab macroData={macroData} setMacroData={setMacroData} />}
            {tab === "workouts" && <WorkoutsTab workoutData={workoutData} setWorkoutData={setWorkoutData} />}
            {tab === "progress" && <ProgressTab workoutData={workoutData} />}
            {tab === "review" && <ReviewTab macroData={macroData} workoutData={workoutData} />}
          </div>

          <div style={{ position: "fixed", bottom: 0, left: 0, right: 0, background: COLORS.surfaceRaised, borderTop: `1px solid ${COLORS.line}`, display: "flex", justifyContent: "center" }}>
            <div style={{ display: "flex", width: "100%", maxWidth: 480 }}>
              {tabs.map(({ id, label, icon: Icon }) => (
                <button
                  key={id}
                  onClick={() => setTab(id)}
                  style={{
                    flex: 1,
                    background: "none",
                    border: "none",
                    padding: "10px 0 12px",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    gap: 3,
                    cursor: "pointer",
                    color: tab === id ? COLORS.plate : COLORS.iron,
                  }}
                >
                  <Icon size={20} strokeWidth={tab === id ? 2.5 : 2} />
                  <span style={{ fontFamily: "Inter", fontSize: 10, fontWeight: 600, letterSpacing: 0.3, textTransform: "uppercase" }}>{label}</span>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
