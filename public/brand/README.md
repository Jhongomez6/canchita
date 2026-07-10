# Marca — La Canchita

La **C** es el círculo central de una cancha (con el punto de saque en el medio). El mismo símbolo abre el logotipo, donde el punto de la **i** de "Canchita" es un balón de fútbol.

## Archivos

### Símbolo (ícono)
| Archivo | Uso |
|---------|-----|
| `icon.svg` | Símbolo verde, fondo transparente. Uso general sobre claro. |
| `icon-white.svg` | Símbolo blanco, fondo transparente. Sobre fondos oscuros/verde. |
| `icon-tile.svg` | Símbolo blanco sobre azulejo verde redondeado. App icon / favicon. |
| `icon-maskable.svg` | Full-bleed con zona segura (~80%) para íconos maskable de PWA. |

### Logotipo (wordmark)
| Archivo | Uso |
|---------|-----|
| `logo-wordmark.svg` | "la Canchita" — **curvas outlineadas** (no depende de la fuente). Verde. |
| `logo-wordmark-white.svg` | Igual, en blanco para fondos oscuros/verde. |
| `logo-wordmark.png` | Rasterizado del wordmark verde, fondo transparente. |

### PNG del ícono (para `manifest.json`)
`icon-192/512/1024.png`, sus variantes `-maskable.png`, y `favicon-48.png`.
Generados desde `icon-tile.svg` / `icon-maskable.svg`.

## Paleta

| Color | Hex | Uso |
|-------|-----|-----|
| Verde | `#1f7a4f` | Principal (símbolo, texto) |
| Verde oscuro | `#145c3a` | Gradiente del azulejo / costuras del balón |
| Esmeralda | `#10b981` | Acento |
| Slate | `#0f172a` | Texto neutro oscuro |

## Construcción del símbolo (viewBox 0 0 100 100)

- **C:** arco `M72.3 29.9 A30 30 0 1 0 72.3 70.1`, `stroke-width` 11, remates redondeados.
- **Punto de saque:** círculo centrado `r=8`, mismo color que la C.
- **Azulejo:** `rect rx=26`, gradiente 140° de `#1f7a4f` a `#145c3a`.

## Tipografía

Logotipo en **Plus Jakarta Sans** (la fuente de la app): "la" en peso 500 al 60% de opacidad + "Canchita" en peso 800, con la C reemplazada por el símbolo y el punto de la *i* como balón. El `logo-wordmark.svg` ya viene con el texto convertido a curvas, así que es portable y no requiere la fuente instalada.

## Logo in-app (`public/logo/`)

Wordmark integrado horizontal (la C es el símbolo, balón en la *i*), curvas outlineadas:

| Archivo | Uso |
|---------|-----|
| `lacanchita-logo.png` | Verde. Sobre **fondos claros / tarjetas blancas**. |
| `lacanchita-logo-white.png` | Blanco. Sobre **fondos oscuros / verde** (Header, footers, FIFA card). |

Regla: sobre claro → verde; sobre oscuro → blanco. Ya está cableado así en el código.
Ratio ~5.19:1 — al colocarlo, fijar **width** y dejar `height: auto` para no deformarlo.

## Ya cableado en la app

- `manifest.json` → `icon-192/512/1024.png` (+ maskable) = símbolo nuevo.
- Favicon (`app/icon.png`) y `app/apple-icon.png` = símbolo nuevo.
- Logo in-app (`public/logo/lacanchita-logo*.png`) = wordmark integrado; ~15 usos, con las medidas ajustadas para el ratio horizontal. Usos sobre fondo oscuro (Header, FifaPlayerCard, footers) apuntan a la versión blanca.
