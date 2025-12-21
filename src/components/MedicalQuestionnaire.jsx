// src/components/MedicalQuestionnaire.jsx
import React, { useMemo } from "react";

/**
 * Cuestionario médico (Sí/No) para expediente.
 *
 * Props:
 * - value: objeto completo (medical)
 * - onChange: callback con el objeto actualizado
 * - disabled: bloquea edición (ej. cuando no estás en modo edición)
 *
 * Estructura esperada en Firestore:
 * patient.medical = {
 *   underTreatment: boolean|null,
 *   takingMedication: boolean|null,
 *   conditions: {
 *     diabetes, arthritis, heartDisease, rheumaticFever, hepatitis, ulcers, kidneyDisorders, nervousDisorders,
 *     otherText: string
 *   },
 *   surgeryOrHospitalized: boolean|null,
 *   healthChangeLastMonths: boolean|null,
 *   allergies: { aspirin:boolean, penicillin:boolean, sulfas:boolean, otherText:string },
 *   abnormalAnesthesiaReaction: boolean|null,
 *   prolongedBleeding: boolean|null,
 *   fainting: boolean|null,
 *   pregnant: boolean|null,
 *   lactation: boolean|null,
 *   menstrualDisorders: boolean|null,
 *   observations: string
 * }
 */

function cn(...xs) {
  return xs.filter(Boolean).join(" ");
}

function YesNo({ label, value, onChange, disabled }) {
  return (
    <div className={cn("flex flex-col gap-2 rounded-2xl border border-slate-200 bg-white p-3", disabled ? "opacity-70" : "")}>
      <div className="text-sm font-semibold text-slate-900">{label}</div>

      <div className="flex gap-2">
        <button
          type="button"
          onClick={() => !disabled && onChange(true)}
          disabled={disabled}
          className={cn(
            "rounded-2xl px-3 py-2 text-sm font-semibold ring-1",
            value === true
              ? "bg-slate-900 text-white ring-slate-900"
              : "bg-slate-100 text-slate-900 ring-slate-200 hover:bg-slate-200",
            disabled ? "cursor-not-allowed hover:bg-slate-100" : ""
          )}
        >
          Sí
        </button>

        <button
          type="button"
          onClick={() => !disabled && onChange(false)}
          disabled={disabled}
          className={cn(
            "rounded-2xl px-3 py-2 text-sm font-semibold ring-1",
            value === false
              ? "bg-slate-900 text-white ring-slate-900"
              : "bg-slate-100 text-slate-900 ring-slate-200 hover:bg-slate-200",
            disabled ? "cursor-not-allowed hover:bg-slate-100" : ""
          )}
        >
          No
        </button>
      </div>

      <div className="text-xs text-slate-500">
        {value === null || value === undefined ? "Sin responder" : value ? "Respondió: Sí" : "Respondió: No"}
      </div>
    </div>
  );
}

function Checkbox({ label, checked, onChange, disabled }) {
  return (
    <label className={cn("flex items-center gap-2 text-sm text-slate-800", disabled ? "opacity-70" : "")}>
      <input
        type="checkbox"
        checked={!!checked}
        onChange={(e) => !disabled && onChange(e.target.checked)}
        disabled={disabled}
        className={cn("h-4 w-4", disabled ? "cursor-not-allowed" : "")}
      />
      <span>{label}</span>
    </label>
  );
}

function CharCount({ value, max }) {
  const n = (value || "").length;
  return (
    <div className={cn("mt-1 text-xs", n > max ? "text-rose-700" : "text-slate-500")}>
      {n}/{max}
    </div>
  );
}

export default function MedicalQuestionnaire({ value, onChange, disabled = false }) {
  const v = useMemo(() => value || {}, [value]);

  function safeChange(next) {
    if (disabled) return;
    onChange(next);
  }

  function setRoot(key, val) {
    safeChange({ ...v, [key]: val });
  }

  function setNested(section, key, val) {
    safeChange({
      ...v,
      [section]: {
        ...(v?.[section] || {}),
        [key]: val,
      },
    });
  }

  const MAX_OTHER = 80;
  const MAX_OBS = 800;

  return (
    <div className="space-y-4">
      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="text-base font-extrabold text-slate-900">Cuestionario médico</div>
        <div className="mt-1 text-sm text-slate-600">
          Completalo con el paciente. Lo crítico se mostrará como alertas en el histórico.
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <YesNo
            label="¿Está actualmente bajo tratamiento médico?"
            value={v.underTreatment}
            onChange={(x) => setRoot("underTreatment", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Está tomando algún medicamento?"
            value={v.takingMedication}
            onChange={(x) => setRoot("takingMedication", x)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="text-sm font-extrabold text-slate-900">Antecedentes y padecimientos</div>

        <div className="mt-3 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <YesNo label="Diabetes" value={v?.conditions?.diabetes} onChange={(x) => setNested("conditions", "diabetes", x)} disabled={disabled} />
          <YesNo label="Artritis" value={v?.conditions?.arthritis} onChange={(x) => setNested("conditions", "arthritis", x)} disabled={disabled} />
          <YesNo
            label="Enfermedades cardíacas"
            value={v?.conditions?.heartDisease}
            onChange={(x) => setNested("conditions", "heartDisease", x)}
            disabled={disabled}
          />
          <YesNo
            label="Fiebre reumática"
            value={v?.conditions?.rheumaticFever}
            onChange={(x) => setNested("conditions", "rheumaticFever", x)}
            disabled={disabled}
          />
          <YesNo label="Hepatitis" value={v?.conditions?.hepatitis} onChange={(x) => setNested("conditions", "hepatitis", x)} disabled={disabled} />
          <YesNo label="Úlceras" value={v?.conditions?.ulcers} onChange={(x) => setNested("conditions", "ulcers", x)} disabled={disabled} />
          <YesNo
            label="Trastornos renales"
            value={v?.conditions?.kidneyDisorders}
            onChange={(x) => setNested("conditions", "kidneyDisorders", x)}
            disabled={disabled}
          />
          <YesNo
            label="Trastornos del sistema nervioso"
            value={v?.conditions?.nervousDisorders}
            onChange={(x) => setNested("conditions", "nervousDisorders", x)}
            disabled={disabled}
          />
        </div>

        <div className="mt-3">
          <label className="text-sm font-bold text-slate-900">Otros padecimientos (texto)</label>
          <input
            value={v?.conditions?.otherText || ""}
            onChange={(e) => setNested("conditions", "otherText", e.target.value.slice(0, MAX_OTHER))}
            disabled={disabled}
            maxLength={MAX_OTHER}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
            placeholder="Opcional (ej: hipertensión, asma...)"
          />
          <CharCount value={v?.conditions?.otherText || ""} max={MAX_OTHER} />
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <YesNo
            label="¿Le han operado alguna vez o ha estado internado(a)?"
            value={v.surgeryOrHospitalized}
            onChange={(x) => setRoot("surgeryOrHospitalized", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Ha notado cambios importantes en su salud en los últimos meses?"
            value={v.healthChangeLastMonths}
            onChange={(x) => setRoot("healthChangeLastMonths", x)}
            disabled={disabled}
          />
        </div>
      </div>

      <div className="rounded-3xl bg-white p-4 ring-1 ring-slate-200">
        <div className="text-sm font-extrabold text-slate-900">Alergias y reacciones</div>

        <div className="mt-3 rounded-2xl border border-slate-200 bg-slate-50 p-3">
          <div className="text-sm font-semibold text-slate-900">¿Es alérgico(a) a…?</div>
          <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-2">
            <Checkbox label="Aspirina" checked={v?.allergies?.aspirin} onChange={(x) => setNested("allergies", "aspirin", x)} disabled={disabled} />
            <Checkbox label="Penicilina" checked={v?.allergies?.penicillin} onChange={(x) => setNested("allergies", "penicillin", x)} disabled={disabled} />
            <Checkbox label="Sulfas" checked={v?.allergies?.sulfas} onChange={(x) => setNested("allergies", "sulfas", x)} disabled={disabled} />
          </div>

          <div className="mt-3">
            <label className="text-sm font-bold text-slate-900">Otras alergias o medicamentos: </label>
            <input
              value={v?.allergies?.otherText || ""}
              onChange={(e) => setNested("allergies", "otherText", e.target.value.slice(0, MAX_OTHER))}
              disabled={disabled}
              maxLength={MAX_OTHER}
              className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
              placeholder="Opcional"
            />
            <CharCount value={v?.allergies?.otherText || ""} max={MAX_OTHER} />
          </div>
        </div>

        <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
          <YesNo
            label="¿Ha tenido alguna reacción anormal a la anestesia dental?"
            value={v.abnormalAnesthesiaReaction}
            onChange={(x) => setRoot("abnormalAnesthesiaReaction", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Presenta sangrado prolongado?"
            value={v.prolongedBleeding}
            onChange={(x) => setRoot("prolongedBleeding", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Ha tenido episodios de desmayo? (Si aplica)"
            value={v.fainting}
            onChange={(x) => setRoot("fainting", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Está embarazada? (Si aplica)"
            value={v.pregnant}
            onChange={(x) => setRoot("pregnant", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Está en período de lactancia? (Si aplica)"
            value={v.lactation}
            onChange={(x) => setRoot("lactation", x)}
            disabled={disabled}
          />
          <YesNo
            label="¿Presenta trastornos durante el ciclo menstrual? (Si aplica)"
            value={v.menstrualDisorders}
            onChange={(x) => setRoot("menstrualDisorders", x)}
            disabled={disabled}
          />
        </div>

        <div className="mt-4">
          <label className="text-sm font-bold text-slate-900">Observaciones</label>
          <textarea
            rows={4}
            value={v.observations || ""}
            onChange={(e) => setRoot("observations", e.target.value.slice(0, MAX_OBS))}
            disabled={disabled}
            maxLength={MAX_OBS}
            className="mt-1 w-full rounded-2xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:ring-2 focus:ring-emerald-300 disabled:bg-slate-50"
            placeholder="Opcional"
          />
          <CharCount value={v.observations || ""} max={MAX_OBS} />
        </div>
      </div>
    </div>
  );
}
