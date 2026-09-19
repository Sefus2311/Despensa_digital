"use client";

// Envía el formulario de filtros de /admin/interpreter en cuanto se cambia
// el estado (Activos/Eliminados/Validar) -- mismo patrón que
// StoreFilterSelect.tsx para "Lugar de compra": un selector de estado
// discreto no debería necesitar pulsar "Buscar" aparte para tener efecto.
export function InterpreterEstadoSelect({ defaultValue }: { defaultValue: string }) {
  return (
    <select
      name="estado"
      defaultValue={defaultValue}
      onChange={(e) => e.currentTarget.form?.requestSubmit()}
      className="ui-field__input flex-1"
    >
      <option value="activos">Activos</option>
      <option value="eliminados">Eliminados</option>
      <option value="validar">Validar</option>
    </select>
  );
}
