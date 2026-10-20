#!/usr/bin/env bash
#
# Comprueba en el simulador del Mac que la app ARRANCA y sigue viva, antes de
# gastar una subida a la App Store (diez minutos y una ronda de revision).
#
#   ./scripts/ios/probar-simulador.sh        # el iOS mas nuevo que haya (27)
#   ./scripts/ios/probar-simulador.sh 26     # un iOS concreto
#
# Nace del 20-10-2026: la 1.5.0, compilada con Xcode 27 sin el ciclo de vida
# UIScene, se cerraba al abrirse en cualquier iPhone con iOS 27 y en iOS 26
# arrancaba bien. El simulador de iOS 27 lo habria cazado en un minuto.
#
# Lo que hace: compila la web, prepara el proyecto, compila para el simulador,
# instala limpio, arranca, espera y mira si la app sigue viva y si la web se ha
# cargado una sola vez, y lo que dice iOS del ciclo de vida. Luego prueba un
# enlace con la app abierta y otro con la app cerrada (arranque en frio), que es
# lo que cambia con UIScene. Deja capturas en el Escritorio.

set -euo pipefail

BUNDLE="shop.gonperstudio.socio"
ENLACE_PRUEBA="shop.gonperstudio.socio://cobros"
IOS_PEDIDO="${1:-}"

RAIZ="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
cd "$RAIZ"
DD="/tmp/${BUNDLE}-simulador"
CONSOLA="/tmp/${BUNDLE}-consola.log"

echo "==> 1/5  Web y proyecto iOS"
npm run build
npx cap sync ios
# Su codigo de salida solo avisa del GoogleService-Info.plist; no corta.
bash scripts/ios/preparar.sh || true

echo "==> 2/5  Buscando simulador"
# `simctl list` agrupa por version: "-- iOS 27.0 --" y debajo los aparatos con
# su UDID entre parentesis. Se queda con un iPhone del iOS mas alto (o del pedido).
UDID_Y_VERSION="$(xcrun simctl list devices available | awk -v pedido="$IOS_PEDIDO" '
  /^-- iOS / { version = $3; next }
  /^-- /     { version = ""; next }
  version != "" && /iPhone/ && match($0, /\([0-9A-F]+-[0-9A-F]+-[0-9A-F]+-[0-9A-F]+-[0-9A-F]+\)/) {
    if (pedido == "" || version == pedido || index(version, pedido ".") == 1) {
      print version, substr($0, RSTART + 1, RLENGTH - 2)
    }
  }' | sort -t. -k1,1n -k2,2n | tail -1)"

if [ -z "$UDID_Y_VERSION" ]; then
  echo "ERROR: no hay ningun simulador de iPhone${IOS_PEDIDO:+ con iOS $IOS_PEDIDO}."
  echo "       Runtimes instalados:"
  xcrun simctl list runtimes available | sed 's/^/         /'
  echo "       Para bajar el de iOS que trae este Xcode:  xcodebuild -downloadPlatform iOS"
  exit 1
fi
VERSION_SIM="${UDID_Y_VERSION%% *}"
UDID="${UDID_Y_VERSION##* }"
echo "    iPhone con iOS $VERSION_SIM ($UDID)"

echo "==> 3/5  Compilando para el simulador (la primera vez tarda: baja Firebase)"
xcodebuild -project ios/App/App.xcodeproj -scheme App -configuration Debug \
  -destination "id=$UDID" -derivedDataPath "$DD" \
  CODE_SIGNING_ALLOWED=NO -quiet build
APP="$DD/Build/Products/Debug-iphonesimulator/App.app"

# Sin `| grep -q`: con pipefail, grep cierra el pipe al encontrarlo, launchctl
# muere con SIGPIPE y daria "se ha cerrado" justo cuando esta viva.
sigue_viva() {
  local procesos
  procesos="$(xcrun simctl spawn "$UDID" launchctl list 2>/dev/null || true)"
  [[ "$procesos" == *"UIKitApplication:$BUNDLE"* ]]
}

echo "==> 4/5  Arrancando en iOS $VERSION_SIM"
xcrun simctl boot "$UDID" 2>/dev/null || true
xcrun simctl bootstatus "$UDID" -b >/dev/null
open -a Simulator 2>/dev/null || true
xcrun simctl uninstall "$UDID" "$BUNDLE" 2>/dev/null || true
xcrun simctl install "$UDID" "$APP"

# Sin esto, el primer `simctl openurl` de un esquema propio saca el dialogo
# "Abrir en App?" y la app no se abre hasta que alguien pulsa Abrir: la prueba
# de enlaces daria FALLA con la app sana. Se aprueba el esquema de antemano en
# el simulador. Es un ajuste interno de iOS, no documentado: si algun dia deja
# de valer, la prueba del arranque en frio solo AVISA, no corta.
ESQUEMA="${ENLACE_PRUEBA%%://*}"
xcrun simctl spawn "$UDID" defaults write com.apple.launchservices.schemeapproval \
  "com.apple.CoreSimulator.CoreSimulatorBridge-->$ESQUEMA" -string "$BUNDLE" 2>/dev/null || true

# --console-pty y no --console: sin terminal, la app guarda su salida en un
# buffer y "Loading app at" puede no llegar al archivo a tiempo. Con PTY sale
# linea a linea. simctl se queda enganchado hasta que la app muere.
INICIO="$(date '+%Y-%m-%d %H:%M:%S')"
xcrun simctl launch --console-pty "$UDID" "$BUNDLE" >"$CONSOLA" 2>&1 &
sleep 10

FALLOS=0
AVISOS=0
if sigue_viva; then
  echo "    OK: la app sigue abierta a los 10 segundos"
else
  echo "    FALLO: la app se ha cerrado sola. Final de la consola:"
  tail -20 "$CONSOLA" | sed 's/^/      /'
  FALLOS=1
fi

# Que siga viva no basta: con la ventana mal enganchada puede quedarse abierta
# en negro, sin web. La web tiene que cargarse UNA vez: 0 es pantalla negra, 2
# son dos ventanas.
CARGAS="$(grep -c "Loading app at" "$CONSOLA" || true)"
CARGAS="${CARGAS:-0}"
if [ "$CARGAS" -eq 1 ]; then
  echo "    OK: la web se ha cargado una vez"
elif [ "$CARGAS" -eq 0 ]; then
  echo "    FALLO: la web no se ha cargado (pantalla negra). Mira la captura."
  FALLOS=1
else
  echo "    FALLO: la web se ha cargado $CARGAS veces (dos ventanas). Revisar el SceneDelegate."
  FALLOS=1
fi

# Lo que dice iOS del ciclo de vida va al registro del sistema, no a la consola
# de la app. En iOS 27 es el motivo del cierre; en iOS 26 es solo un aviso, que
# es justo lo que hay que cazar ahi porque la app arranca igual.
REGISTRO="$(xcrun simctl spawn "$UDID" log show --start "$INICIO" --style compact \
  --predicate 'process == "App"' 2>/dev/null || true)"
if grep -Eqi 'UIScene ?life ?cycle (is|will soon be) required|does not adopt UIScene' <<<"$REGISTRO"; then
  echo "    FALLO: iOS se queja de que falta el ciclo de vida UIScene"
  FALLOS=1
fi
xcrun simctl io "$UDID" screenshot "$HOME/Desktop/prueba-socio-ios${VERSION_SIM}-arranque.png" >/dev/null 2>&1 || true

echo "==> 5/5  Enlaces ($ENLACE_PRUEBA)"
if [ "$FALLOS" -eq 0 ]; then
  # Con la app abierta: llega por scene(_:openURLContexts:). Si muere aqui es
  # un fallo de verdad: estaba viva justo antes.
  xcrun simctl openurl "$UDID" "$ENLACE_PRUEBA"
  sleep 4
  if sigue_viva; then
    echo "    OK: enlace con la app abierta"
  else
    echo "    FALLO: la app se cerro al recibir el enlace con la app abierta"
    FALLOS=1
  fi

  # Con la app cerrada: arranca desde el enlace (connectionOptions.urlContexts).
  # Si no arranca puede ser el dialogo "Abrir en" (si la aprobacion de arriba
  # no hizo efecto), asi que aqui solo se avisa y se mira la captura.
  xcrun simctl terminate "$UDID" "$BUNDLE" 2>/dev/null || true
  sleep 2
  xcrun simctl openurl "$UDID" "$ENLACE_PRUEBA"
  sleep 8
  if sigue_viva; then
    echo "    OK: enlace con la app cerrada (arranque en frio)"
  else
    echo "    AVISO: la app no arranco desde el enlace con la app cerrada."
    echo "           Mira la captura del enlace: si sale el dialogo \"Abrir en\", pulsa"
    echo "           Abrir en el simulador y comprueba que la app abre. Si no sale, es un fallo."
    AVISOS=1
  fi
  xcrun simctl io "$UDID" screenshot "$HOME/Desktop/prueba-socio-ios${VERSION_SIM}-enlace.png" >/dev/null 2>&1 || true
else
  echo "    saltado: la app no arranca"
fi

echo
echo "Consola de la app: $CONSOLA"
echo "Capturas: ~/Desktop/prueba-socio-ios${VERSION_SIM}-*.png"
if [ "$FALLOS" -ne 0 ]; then
  echo "RESULTADO: FALLA en iOS $VERSION_SIM. No subas esta version."
  exit 1
fi
if [ "$AVISOS" -ne 0 ]; then
  echo "RESULTADO: arranca bien en iOS $VERSION_SIM, con un AVISO (mira arriba)."
  exit 0
fi
echo "RESULTADO: arranca bien en iOS $VERSION_SIM."
echo "Si quieres ver el login o un push, sigue a mano en el simulador abierto."
