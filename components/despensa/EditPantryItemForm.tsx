"use client";

import { useActionState } from "react";
import { updatePantryItem, type UpdatePantryItemState } from "@/app/(app)/despensa/actions";
import { Card } from "@/components/Card";
import { Alert } from "@/components/ui/Alert";
import { Button } from "@/components/ui/Button";
import { Input } from "@/components/ui/Input";
import { Select } from "@/components/ui/Select";
import { PRODUCT_CATEGORIES, type ProductCategory } from "@/lib/constants/product-categories";
import { STANDARD_UNITS } from "@/lib/units";

// Sin opción de eliminar a propósito: un artículo procede de una compra
// registrada, y esa compra no se borra ni se cancela desde aquí.
export function EditPantryItemForm({
  canonicalProductId,
  initialName,
  initialCategory,
  initialBrand,
  initialStock,
  initialUnit,
}: {
  canonicalProductId: string;
  initialName: string;
  initialCategory: ProductCategory;
  initialBrand: string;
  initialStock: number;
  initialUnit: string;
}) {
  const boundAction = updatePantryItem.bind(null, canonicalProductId);
  const [state, formAction, pending] = useActionState<UpdatePantryItemState, FormData>(boundAction, null);

  return (
    <form action={formAction}>
      <Card className="flex flex-col gap-3">
        <Input label="Nombre" name="name" defaultValue={initialName} required maxLength={200} />
        <Select label="Categoría" name="category" defaultValue={initialCategory} required>
          {PRODUCT_CATEGORIES.map((category) => (
            <option key={category} value={category}>
              {category}
            </option>
          ))}
        </Select>
        <Input label="Marca" name="brand" defaultValue={initialBrand} placeholder="Opcional" maxLength={200} />
        <div className="flex gap-3">
          <div className="flex-1 min-w-0">
            <Input
              label="Cantidad disponible"
              name="stock"
              type="number"
              step="0.001"
              min={0}
              inputMode="decimal"
              defaultValue={initialStock}
              required
            />
          </div>
          <div className="flex-1 min-w-0">
            <Select label="Unidad" name="unit" defaultValue={initialUnit}>
              <option value="">Sin unidad</option>
              {initialUnit && !(STANDARD_UNITS as readonly string[]).includes(initialUnit) && (
                <option value={initialUnit}>{initialUnit}</option>
              )}
              {STANDARD_UNITS.map((unit) => (
                <option key={unit} value={unit}>
                  {unit}
                </option>
              ))}
            </Select>
          </div>
        </div>

        {state?.error && <Alert tone="danger">{state.error}</Alert>}

        <Button type="submit" loading={pending}>
          Guardar cambios
        </Button>
      </Card>
    </form>
  );
}
