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
        FirebaseApp.configure()
        return true
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
