# Biblioteca de iconos — Despensa Digital / Mayordomo Digital

Un único componente `Icon` (`components/icons/Icon.tsx`) con prop `name: IconName`
y un diccionario tipado de SVG, siguiendo la misma arquitectura que la
biblioteca `BlueprintIcon` de RealMargin (evita decenas de ficheros casi
idénticos; todo el trazo vive en un solo sitio).

Reglas de construcción (heredadas de RealMargin, `DESIGN_SYSTEM.md` §7):
viewBox `0 0 24 24`, área útil 20×20, trazo principal 1.5, trazo auxiliar
0.75, `stroke-linecap`/`stroke-linejoin: round`, color principal
`currentColor`, acento puntual en `var(--color-primary)` (no en
`var(--rm-color-brand)`: es un token propio, no el naranja de RealMargin).

## Origen de cada icono

**Reutilizados tal cual de RealMargin** (ya eran genéricos, sin relación
con presupuestos/facturas/pintura): `ajustes`, `buscar`, `notificaciones`,
`telefono`, `reloj`, `ubicacion`, `ayuda`, `cerrar`, `advertencia`, `vacio`,
`editar`, `guardar`.

**Adaptados** (misma geometría, renombrados o con el acento de marca
sustituido por `--color-primary`, o con algún detalle de RealMargin
retirado por no aportar nada fuera de ese dominio):

- `eliminar` ← `eliminar-linea` (papelera) de RealMargin; se descartó el
  glifo `eliminar` original de RealMargin (un aspa) para quedarnos con un
  único icono de "eliminar" reconocible.
- `usuario` ← `cuenta`.
- `contactos` ← `clientes-h`.
- `documentos` ← `factura` (documento con líneas de texto).
- `compartir` ← `exportar`.
- `confirmar` ← `exito`.
- `mensajes` ← `prompt`, quitando los corchetes `</>` de "código" (eran
  específicos de un contexto de IA/prompt) y dejando la burbuja con puntos
  de "escribiendo", genérica.

**Nuevos**, construidos siguiendo las mismas reglas por no existir
equivalente en RealMargin (su app no usa iconos vectoriales en la
navegación principal, solo emoji — ver su `ICONOS.md`):

- `home`, `despensa` — navegación principal de esta app.
- `camara` — sustituye el emoji 📷 del botón "Escanear ticket".
- `calendario` — pensado para fechas de caducidad (no existía nada
  parecido en RealMargin).
- `volver`, `menu`, `tareas`, `anadir`, `microfono`.

## No reutilizados de RealMargin (y por qué)

Todo lo ligado al dominio de presupuestos/facturas/pintura o a la métrica
de margen: `presupuestos`, `facturas-h`, `rentabilidad`, `margen`,
`costes`, `beneficio`, `moneda`, `materiales`, `producto`, `rendimiento`,
`calcular-horas`, `crear-factura`, `ver-pdf`, `rectificativa`, `cobro`,
`calculadora`, `trabajo` (rodillo de pintor), `superficie`, `medicion`,
`limpieza`, `remates`, `desplazamientos`, `preparacion`, `proteccion-zona`,
`realmargin` (wordmark), `academia`, `plegar-zona` (caso muy específico de
un formulario de RealMargin), `dashboard`/`panel`/`clientes`/`clientes-h`
como tal (se quedó solo su variante renombrada `contactos`),
`email`/`email-enviado`/`cookies`/`saludo`/`placeholder-foto` (specific a
pantallas de auth/perfil de RealMargin sin equivalente directo aquí),
`duplicar`/`exportar` como tal (`exportar` sí se reutilizó, renombrado
`compartir`; `duplicar` no tenía uso previsible en esta app y se dejó
fuera para no acumular iconos sin consumidor).

## Uso

```tsx
import { Icon } from "@/components/icons/Icon";

<Icon name="despensa" size={24} />
<Icon name="eliminar" size={24} title="Eliminar producto" />
```

Decorativo (por defecto): `aria-hidden`. Informativo sin texto visible al
lado: pasar `title` (se traduce en `role="img"` + `aria-label`).
