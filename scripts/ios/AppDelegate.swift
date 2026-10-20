//
//  AppDelegate listo para copiar sobre el que genera Capacitor:
//
//      cp scripts/ios/AppDelegate.swift ios/App/App/AppDelegate.swift
//
//  (preparar.sh lo copia solo, en cada publicacion.)
//
//  Es el mismo que ya funciona en la app de clientes, con tres cosas que no
//  trae el de serie:
//
//  1. `FirebaseApp.configure()` al arrancar. Sin esto, pedir el token de
//     notificaciones tumba el proceso — el mismo fallo que en Android daba
//     "Default FirebaseApp is not initialized".
//
//  2. El evento `registration` devuelve el token de FCM y NO el de APNs, que es
//     lo que Capacitor emite por defecto. El backend guarda tokens FCM y manda
//     por Firebase; con el token de APNs crudo, el dispositivo queda registrado
//     y no le llega jamas un aviso, sin ningun error por ningun lado.
//
//  3. Ciclo de vida UIScene (clase SceneDelegate, al final del archivo).
//     Compilada con Xcode 27 (SDK de iOS 27), una app que no lo adopta muere al
//     abrirse en iOS 27: pantalla negra y se cierra en menos de medio segundo,
//     siempre, aunque se reinstale. En iOS 26 arranca igual, por eso el
//     20-10-2026 solo le fallaba al barbero que ya habia actualizado a iOS 27.
//     El SceneDelegate vive en ESTE archivo a proposito: ya esta en el target
//     App, asi que no hay que tocar project.pbxproj. El manifiesto del
//     Info.plist (UIApplicationSceneManifest) lo escribe preparar.sh.
//     Funciona con @capacitor/ios 8.4.x (que no trae SceneDelegateProxy) y 8.5.x.
//

import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    // Con escenas UIKit ya no la rellena: la ventana es de SceneDelegate, que la
    // copia aqui al conectarse. Se queda porque el Info.plist sigue declarando
    // UIMainStoryboardFile y porque el plugin SplashScreen la consulta.
    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configurarFirebase()
        return true
    }

    // La escena principal la lleva SceneDelegate, con la ventana que UIKit crea
    // desde Main.storyboard (CAPBridgeViewController), igual que antes.
    //
    // Cualquier otro rol (pantalla externa, AirPlay) se devuelve SIN delegado:
    // asi iOS duplica la pantalla en vez de arrancar una segunda copia de la web
    // (es el fallo de la plantilla de Capacitor 8.5, ionic-team/capacitor#8648).
    func application(_ application: UIApplication,
                     configurationForConnecting connectingSceneSession: UISceneSession,
                     options: UIScene.ConnectionOptions) -> UISceneConfiguration {
        let config = UISceneConfiguration(name: "Default Configuration",
                                          sessionRole: connectingSceneSession.role)
        guard connectingSceneSession.role == .windowApplication else {
            return config
        }
        config.delegateClass = SceneDelegate.self
        // UIKit la rellena desde UISceneStoryboardFile del Info.plist. Si por lo
        // que sea no lo hiciera, sin storyboard no habria ventana: pantalla negra.
        if config.storyboard == nil {
            config.storyboard = UIStoryboard(name: "Main", bundle: nil)
        }
        return config
    }

    /// Arranca Firebase SOLO si su configuracion esta dentro del binario.
    ///
    /// `FirebaseApp.configure()` a secas lanza una NSException de Objective-C
    /// cuando no encuentra el GoogleService-Info.plist en el bundle. Swift no
    /// puede capturar una NSException, asi que sube sin recoger y iOS mata el
    /// proceso: la app se cierra sola nada mas abrirse, siempre, y el build se
    /// compila, firma y sube a TestFlight sin una sola queja. Paso de verdad en
    /// la primera subida.
    ///
    /// `FirebaseOptions(contentsOfFile:)` devuelve nil en vez de lanzar, asi que
    /// preguntar primero es lo unico seguro. Sin plist la app arranca igual y
    /// como mucho se queda sin avisos, que es lo que promete `push.js`.
    private func configurarFirebase() {
        guard let ruta = Bundle.main.path(forResource: "GoogleService-Info", ofType: "plist"),
              let opciones = FirebaseOptions(contentsOfFile: ruta) else {
            NSLog("[push] Falta GoogleService-Info.plist en el binario (¿esta en el target App?). La app sigue, sin notificaciones.")
            return
        }

        // Y ademas, que la clave TENGA SENTIDO. Que el archivo exista no basta:
        // una copia del plist se quedo a medias al pegarla por terminal y su
        // API_KEY tenia 8 caracteres en vez de 39. Firebase valida el formato
        // DENTRO de configure(), lanzando una NSException que Swift no puede
        // capturar, asi que la app se cerraba al abrirse. Comprobandolo antes,
        // como mucho nos quedamos sin avisos.
        let clave = opciones.apiKey ?? ""
        let formatoValido = clave.count >= 30
            && clave.allSatisfy { $0.isLetter || $0.isNumber || $0 == "-" || $0 == "_" }
        guard formatoValido else {
            NSLog("[push] La API_KEY del GoogleService-Info.plist no tiene buena pinta (\(clave.count) caracteres). Firebase no se configura; la app sigue, sin notificaciones.")
            return
        }

        FirebaseApp.configure(options: opciones)
    }

    // applicationDidBecomeActive / WillResignActive / DidEnterBackground /
    // WillEnterForeground ya no se llaman con escenas, y no hacen falta: el
    // plugin App escucha las NOTIFICACIONES de UIApplication, que iOS sigue
    // publicando, y de ahi salen appStateChange, pause y resume.

    // Con escenas iOS tampoco llama a estos dos: los enlaces llegan a
    // SceneDelegate. Se quedan por si algun build saliera sin el manifiesto de
    // escenas (no molestan).
    func application(_ app: UIApplication, open url: URL,
                     options: [UIApplication.OpenURLOptionsKey: Any] = [:]) -> Bool {
        return ApplicationDelegateProxy.shared.application(app, open: url, options: options)
    }

    func application(_ application: UIApplication,
                     continue userActivity: NSUserActivity,
                     restorationHandler: @escaping ([UIUserActivityRestoring]?) -> Void) -> Bool {
        return ApplicationDelegateProxy.shared.application(application, continue: userActivity,
                                                           restorationHandler: restorationHandler)
    }

    // APNs registro el dispositivo: se lo pasamos a Firebase y emitimos el token
    // FCM por el evento 'registration' de Capacitor. Sigue aqui con escenas: los
    // avisos remotos son de la app, no de la escena.
    func application(_ application: UIApplication,
                     didRegisterForRemoteNotificationsWithDeviceToken deviceToken: Data) {
        // Segundo sitio donde se puede morir: `Messaging.messaging()` tambien
        // revienta si Firebase no llego a configurarse. Con la guarda de arriba
        // ese caso ya es posible, asi que aqui hay que preguntar igual.
        guard FirebaseApp.app() != nil else {
            NSLog("[push] APNs registro el dispositivo pero Firebase no esta configurado: no hay token FCM que enviar.")
            return
        }
        Messaging.messaging().apnsToken = deviceToken
        Messaging.messaging().token { token, error in
            if let error = error {
                NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                                object: error)
            } else if let token = token {
                NotificationCenter.default.post(name: .capacitorDidRegisterForRemoteNotifications,
                                                object: token)
            }
        }
    }

    func application(_ application: UIApplication,
                     didFailToRegisterForRemoteNotificationsWithError error: Error) {
        NotificationCenter.default.post(name: .capacitorDidFailToRegisterForRemoteNotifications,
                                        object: error)
    }
}

/// Delegado de la escena principal.
///
/// La ventana NO se crea aqui: el Info.plist (UISceneStoryboardFile = Main) hace
/// que UIKit la cree con el CAPBridgeViewController del storyboard, igual que
/// antes. Este delegado solo reenvia a Capacitor los enlaces, que con escenas
/// llegan aqui y no al AppDelegate:
///   - la vuelta del login con Apple/Google y de Stripe Connect
///     (shop.gonperstudio.socio://login, ://cobros), que dispara appUrlOpen y
///     cierra el navegador de la app;
///   - Universal Links, si algun dia se activan.
///
/// Se reenvia por ApplicationDelegateProxy, que existe en todo Capacitor 8:
/// publica las mismas notificaciones que antes y rellena lastURL
/// (App.getLaunchUrl). Con @capacitor/ios >= 8.5 se podria usar
/// SceneDelegateProxy, pero no hace falta.
class SceneDelegate: UIResponder, UIWindowSceneDelegate {

    // UIKit la rellena con la ventana del storyboard. Sin esta propiedad no la
    // retiene nadie y la pantalla se queda negra.
    var window: UIWindow?

    private var urlsDeArranque: Set<UIOpenURLContext> = []
    private var actividadesDeArranque: Set<NSUserActivity> = []

    func scene(_ scene: UIScene, willConnectTo session: UISceneSession,
               options connectionOptions: UIScene.ConnectionOptions) {
        guard session.role == .windowApplication else { return }

        // UIKit ya ha puesto aqui la ventana del storyboard. Se le pasa tambien
        // al AppDelegate porque el plugin SplashScreen la busca ahi: si la
        // encuentra nil cae a connectedScenes.first, que es un Set sin orden, y
        // con una pantalla externa conectada puede coger la escena sin ventana y
        // dejar el splash mal dimensionado.
        (UIApplication.shared.delegate as? AppDelegate)?.window = window

        // Arranque en FRIO desde un enlace: llega aqui, pero los plugins de
        // Capacitor todavia no estan cargados (el puente nace al cargarse la
        // vista). Si se avisara ya, appUrlOpen se perderia. Se entrega en el
        // primer viewDidAppear del CAPBridgeViewController, que es lo mismo que
        // hace Capacitor 8.5.
        urlsDeArranque = connectionOptions.urlContexts
        actividadesDeArranque = connectionOptions.userActivities
        if !urlsDeArranque.isEmpty || !actividadesDeArranque.isEmpty {
            NotificationCenter.default.addObserver(self,
                                                   selector: #selector(entregarEnlacesDeArranque),
                                                   name: .capacitorViewDidAppear,
                                                   object: nil)
        }
    }

    // App abierta o en segundo plano: esquema propio.
    func scene(_ scene: UIScene, openURLContexts URLContexts: Set<UIOpenURLContext>) {
        abrir(URLContexts)
    }

    // App abierta o en segundo plano: Universal Link.
    func scene(_ scene: UIScene, continue userActivity: NSUserActivity) {
        continuar(userActivity)
    }

    @objc private func entregarEnlacesDeArranque() {
        NotificationCenter.default.removeObserver(self, name: .capacitorViewDidAppear, object: nil)
        let urls = urlsDeArranque
        let actividades = actividadesDeArranque
        urlsDeArranque = []
        actividadesDeArranque = []
        abrir(urls)
        actividades.forEach { continuar($0) }
    }

    private func abrir(_ contextos: Set<UIOpenURLContext>) {
        for contexto in contextos {
            var opciones: [UIApplication.OpenURLOptionsKey: Any] = [:]
            if let origen = contexto.options.sourceApplication {
                opciones[.sourceApplication] = origen
            }
            if let anotacion = contexto.options.annotation {
                opciones[.annotation] = anotacion
            }
            opciones[.openInPlace] = contexto.options.openInPlace
            _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                            open: contexto.url,
                                                            options: opciones)
        }
    }

    private func continuar(_ actividad: NSUserActivity) {
        _ = ApplicationDelegateProxy.shared.application(UIApplication.shared,
                                                        continue: actividad,
                                                        restorationHandler: { _ in })
    }
}
