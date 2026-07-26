//
//  AppDelegate listo para copiar sobre el que genera Capacitor:
//
//      cp scripts/ios/AppDelegate.swift ios/App/App/AppDelegate.swift
//
//  Es el mismo que ya funciona en la app de clientes, con dos cosas que no trae
//  el de serie:
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

import UIKit
import Capacitor
import FirebaseCore
import FirebaseMessaging

@UIApplicationMain
class AppDelegate: UIResponder, UIApplicationDelegate {

    var window: UIWindow?

    func application(_ application: UIApplication,
                     didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?) -> Bool {
        configurarFirebase()
        return true
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
        FirebaseApp.configure(options: opciones)
    }

    func applicationDidBecomeActive(_ application: UIApplication) {}
    func applicationWillResignActive(_ application: UIApplication) {}
    func applicationDidEnterBackground(_ application: UIApplication) {}
    func applicationWillEnterForeground(_ application: UIApplication) {}
    func applicationWillTerminate(_ application: UIApplication) {}

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
    // FCM por el evento 'registration' de Capacitor.
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
