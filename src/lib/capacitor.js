import { Capacitor } from '@capacitor/core'

/** ¿Estamos dentro de la app nativa (APK/iOS) o en un navegador web? */
export function isNative() {
  return Capacitor.isNativePlatform()
}

/** 'ios' | 'android' | 'web' */
export function platform() {
  return Capacitor.getPlatform()
}
