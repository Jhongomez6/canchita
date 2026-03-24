# Canchita — Guía Completa de Funcionalidades para Clientes

---

## ¿Qué es Canchita?

Canchita es una **plataforma digital para organizar y gestionar partidos de fútbol amateur**. Conecta a los dueños o administradores de canchas con sus jugadores, y le da a los organizadores de equipos una herramienta profesional para coordinar sus grupos.

Todo desde el celular, sin instalar nada (aunque también se puede instalar como app).

Canchita resuelve los tres problemas más comunes de organizar fútbol amateur:
- **"¿Quién viene?"** → Confirmaciones en tiempo real con lista de asistencia
- **"¿Cómo armamos los equipos?"** → Balance automático por nivel y posición
- **"¿Cómo aviso a todos?"** → Notificaciones push sin grupos de WhatsApp caóticos

---

## Perfiles de usuario

Canchita tiene tres perfiles principales:

| Perfil | ¿Quién es? |
|--------|-----------|
| **Player** | Cualquier jugador que participa en partidos |
| **Location Admin** | Dueño u operador de una cancha o complejo deportivo |
| **Team Admin** | Capitán o coordinador de un equipo o liga amateur |

---

## PLAYER — Experiencia del Jugador

### ¿Qué puede hacer un jugador?

#### Encontrar y unirse a partidos
El jugador entra a la sección **Explorar** y ve todos los partidos públicos disponibles: fecha, hora, cancha, cupos disponibles y nivel del partido. Si el partido tiene cupos llenos, puede anotarse en la **lista de espera** y recibir una notificación automática si se libera un lugar.

También puede acceder a partidos **privados** usando un código de invitación que le comparte el organizador (por WhatsApp, por ejemplo).

#### Confirmar o cancelar asistencia
Con un solo toque confirma que va al partido. Si no puede ir, cancela y el cupo queda disponible para otro jugador. El organizador ve esto en tiempo real.

#### Traer invitados
Si el organizador lo permite, cada jugador puede traer hasta **2 invitados** por partido. Agrega el nombre y la posición del invitado, y queda registrado automáticamente como confirmado.

#### Ver los equipos y el resultado
Cuando el organizador cierra el partido y arma los equipos, el jugador puede ver en su celular:
- En qué equipo quedó
- Quiénes son sus compañeros y rivales (con foto y posición)
- El resultado final del partido

#### Votar al MVP
Después de cerrar el partido, se abre una **ventana de votación de 3 horas** donde cada jugador puede votar al jugador más valioso del partido. El resultado se muestra en tiempo real y el ganador recibe una notificación personalizada.

#### Ver su perfil y estadísticas
Cada jugador tiene un perfil con:
- Partidos jugados, ganados, perdidos y empatados
- **Commitment Score** (0–100): mide qué tan cumplidor es el jugador
  - Llegar tarde descuenta 5 puntos
  - No aparecer descuenta 20 puntos
- Premio MVP acumulado

#### Notificaciones inteligentes
El jugador recibe notificaciones push en su celular (como las de WhatsApp) para:
- Recordatorios del partido
- Resultado de la votación MVP
- Respuesta a feedback enviado

#### Instalar como app
Canchita funciona en el navegador del celular, pero también se puede **instalar en la pantalla de inicio** como si fuera una app descargada de la tienda, sin pasar por App Store ni Google Play.

---

## LOCATION ADMIN — Experiencia del Dueño/Operador de Cancha

### ¿Qué problema resuelve para una cancha?

Un administrador de cancha normalmente coordina partidos por WhatsApp, pierde track de quién confirmó, no sabe cuántos jugadores van a venir, y tiene que recordarle a cada uno manualmente. Canchita reemplaza ese caos con un panel de control profesional.

### ¿Qué puede hacer un Location Admin?

#### Crear partidos públicos o privados
Al crear un partido configura:
- Fecha y hora
- Cancha (de las que tiene asignadas)
- Cantidad máxima de jugadores
- Si acepta invitados
- Si es público (aparece en Explorar) o privado (solo por link)

Una vez creado, puede **compartir el link directamente por WhatsApp** con un mensaje preformateado listo para pegar en el grupo.

#### Panel de gestión del partido
Cada partido tiene un panel con 4 secciones:

**Dashboard**
Vista rápida del estado: cuántos confirmaron, cuántos están pendientes, cuántos en lista de espera y en qué fase está el partido (reclutando, lleno, día de partido, postgame, cerrado).

**Jugadores**
- Ver la lista completa de jugadores con foto, nombre, posición y nivel
- Buscar y agregar jugadores registrados en la plataforma
- Agregar jugadores sin cuenta (por nombre)
- **Pasar lista el día del partido**: marca a cada jugador como Presente, Tarde o No asistió con un solo toque por jugador

**Equipos**
- **Balance automático con un clic**: el algoritmo distribuye los jugadores en dos equipos equilibrados por nivel, posición (arquero, defensas, mediocampistas, delanteros) y cantidad
- **Ajuste manual con drag & drop**: mover jugadores entre equipos arrastrando la tarjeta
- Ingresar el marcador final

**Configuración**
- Compartir el link del partido
- Abrir / cerrar el partido
- Reabrir si hubo un error
- Eliminar el partido

#### Cierre del partido y estadísticas automáticas
Al cerrar el partido, Canchita **actualiza automáticamente las estadísticas de todos los jugadores**: victorias, derrotas, empates, tardanzas y ausencias. No hay que hacer nada manual.

#### Botón de acción flotante (FAB)
Un botón inteligente que cambia según la fase del partido:
- En reclutamiento → Compartir
- Cuando está lleno → Balancear equipos
- El día del partido → Pasar lista
- Post partido → Cerrar
- Cerrado → Ver reporte

---

## TEAM ADMIN — Experiencia del Capitán de Equipo

### ¿Qué problema resuelve para un equipo?

Los capitanes de equipos amateur gestionan grupos de WhatsApp interminables para confirmar quién va, armar equipos, avisar cambios de horario y recordarle a cada uno. Canchita centraliza todo eso en un panel limpio y profesional.

### Diferencias clave vs. Location Admin

- Solo puede crear **partidos privados** (para sus jugadores, no aparecen en Explorar)
- Funciona con las canchas que tenga asignadas
- Puede tener **doble rol**: ser Team Admin y jugador al mismo tiempo en el mismo partido

### Funcionalidades
Todas las del Location Admin para gestión de partido: dashboard, lista de jugadores, pasar lista, balance de equipos, score, cierre y estadísticas automáticas.

La diferencia está en el alcance: el Team Admin no puede ver ni interferir en los partidos de otras organizaciones. Cada equipo gestiona solo lo suyo.

---

## FAQs — Preguntas Frecuentes

### Para canchas y complejos deportivos

**¿Necesito que mis clientes se descarguen una app?**
No. Canchita funciona directamente desde el navegador del celular (Chrome, Safari). Los jugadores abren el link que les mandás y listo. Si quieren, pueden instalarla en la pantalla de inicio para acceder más rápido, pero no es obligatorio.

**¿Cómo llegan los jugadores a un partido?**
Vos compartís el link del partido por WhatsApp. El link abre directamente el partido con toda la info. En partidos privados solo quien tiene el link puede verlo.

**¿Puedo tener varias canchas o complejos?**
Sí. Podés tener múltiples canchas asociadas a tu cuenta. Al crear un partido, seleccionás en cuál cancha se juega.

**¿Qué pasa si un jugador cancela último momento?**
Queda registrado como cancelado en la lista. Si hay jugadores en lista de espera, reciben una notificación automática de que se liberó un cupo.

**¿Puedo ver el historial de partidos pasados?**
Sí, todos los partidos quedan guardados con sus datos: quiénes jugaron, equipos, resultado y asistencia.

**¿Puedo agregar jugadores que no tienen cuenta en Canchita?**
Sí. Podés agregar jugadores por nombre sin que tengan cuenta. Si el jugador luego se registra, sus estadísticas anteriores no se vinculan automáticamente (es una limitación actual del sistema).

**¿Cómo funciona el balance de equipos?**
El algoritmo considera el nivel de cada jugador, sus posiciones (arquero, defensa, mediocampista, delantero) y la cantidad de jugadores. Primero distribuye arqueros, luego por roles y finalmente equilibra el nivel usando un sistema de serpentina (snake draft). El resultado puede ajustarse manualmente con drag & drop.

**¿Puedo reabrir un partido si me equivoqué al cerrarlo?**
Sí. Al reabrir el partido, las estadísticas del cierre anterior se revierten y podés volver a armar los equipos, corregir la asistencia y volver a cerrar.

**¿Cómo funciona la votación de MVP?**
Al cerrar el partido se abre automáticamente una ventana de 3 horas donde los jugadores votan desde su celular. El ganador recibe una notificación. Si hay empate, se comparte el premio. Si matemáticamente ya no puede cambiar el resultado antes de las 3 horas, se cierra anticipadamente.

**¿Las notificaciones son gratis para los jugadores?**
Sí. Las notificaciones push funcionan en Android y iOS sin costo adicional para el jugador. Solo necesita aceptar los permisos de notificación la primera vez.

---

### Para equipos y ligas amateur

**¿Puedo usar Canchita si organizo partidos en canchas de terceros?**
Sí. Como Team Admin se te asignan las canchas donde jugás habitualmente. Al crear el partido, seleccionás la cancha correspondiente.

**¿Mis partidos los ve cualquiera?**
No. Los partidos de Team Admin son siempre privados. Solo accede quien tenga el link.

**¿Puedo jugar yo también en mis propios partidos?**
Sí. El Team Admin puede tener doble rol: gestionar el partido y al mismo tiempo ser jugador en él.

**¿Las estadísticas de mis jugadores se acumulan partido a partido?**
Sí. Cada vez que cerrás un partido, Canchita actualiza automáticamente las estadísticas de todos los jugadores: victorias, derrotas, empates, tardanzas y ausencias. Los jugadores pueden ver su historial desde su perfil.

**¿Cómo sé quién llega siempre y quién nunca aparece?**
El **Commitment Score** de cada jugador (visible en su perfil) refleja exactamente eso. Las tardanzas y ausencias bajan el puntaje. Es una forma objetiva de saber con quién podés contar.

**¿Puedo llevar el registro de resultados de temporada?**
Actualmente las estadísticas son individuales por jugador. El tracking de resultados por equipo a lo largo de una temporada es una funcionalidad futura.

**¿Qué pasa si quiero invitar a alguien que no tiene cuenta?**
Podés agregarlo manualmente con nombre y posición desde el panel. Sus datos quedan registrados en ese partido pero no genera un perfil de usuario.

---

### Generales

**¿Canchita es gratuita?**
[Definir modelo de precios con el equipo antes de comunicar]

**¿Funciona en iPhone y Android?**
Sí, funciona en cualquier navegador moderno (Chrome, Safari, Firefox) tanto en Android como iOS.

**¿Los datos de los jugadores están seguros?**
Sí. La plataforma usa Firebase (Google) como infraestructura. Los datos se almacenan con reglas de acceso estrictas: cada usuario solo puede ver su propia información y la de los partidos en los que participa.

**¿Puedo enviarles feedback o reportar un error?**
Sí. Todos los usuarios (jugadores y admins) tienen acceso a un widget de feedback dentro de la app para reportar bugs, proponer ideas o enviar comentarios. El equipo de Canchita revisa cada reporte y notifica al usuario cuando está resuelto.

**¿Hay soporte disponible?**
[Definir canal de soporte antes de comunicar]
