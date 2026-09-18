"use client";

export function DeleteRecetaButton({ action }: { action: () => void }) {
  return (
    <form
      action={action}
      onSubmit={(e) => {
        if (!confirm("¿Eliminar esta receta? No se puede deshacer.")) {
          e.preventDefault();
        }
      }}
    >
      <button type="submit" className="ui-button ui-button--destructive">
        Eliminar
      </button>
    </form>
  );
}
