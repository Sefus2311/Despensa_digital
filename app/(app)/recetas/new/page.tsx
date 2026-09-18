import { RecipeForm } from "@/components/recetas/RecipeForm";
import { createReceta } from "../actions";

export default function NewRecetaPage() {
  return (
    <div className="flex flex-col gap-4">
      <header>
        <h1 className="text-2xl font-semibold font-display">Nueva receta</h1>
      </header>
      <RecipeForm action={createReceta} submitLabel="Guardar receta" />
    </div>
  );
}
