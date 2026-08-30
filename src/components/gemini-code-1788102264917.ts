import { Linking } from 'react-native';

export interface AliExpressCartParams {
  productId: string;
  skuId: string;
  quantity?: number;
  affiliateId?: string;
}

/**
 * פונקציה ליצירת Deep Link ופתיחת העגלה/מוצר ב-AliExpress עם ה-SKU המדויק
 */
export async function openAliExpressCartWithSku({
  productId,
  skuId,
  quantity = 1,
  affiliateId = process.env.EXPO_PUBLIC_ALIEXPRESS_AFFILIATE_ID || '',
}: AliExpressCartParams): Promise<void> {
  // 1. קישור דפדפן (Web Fallback) כולל פרמטר ה-SKU ומזהה האפיליאייט לשמירת העמלה
  const webUrl = `https://www.aliexpress.com/item/${productId}.html?sku_id=${skuId}&quantity=${quantity}&aff_fcid=${affiliateId}`;

  // 2. URI Scheme לפתיחה ישירה בתוך אפליקציית AliExpress במכשיר
  const appDeepLink = `aliexpress://product/detail?productId=${productId}&skuAttr=${skuId}&qty=${quantity}`;

  try {
    // בדיקה אם אפליקציית AliExpress מותקנת על מכשיר המשתמש
    const canOpenApp = await Linking.canOpenURL(appDeepLink);

    if (canOpenApp) {
      await Linking.openURL(appDeepLink);
    } else {
      // במידה והאפליקציה אינה מותקנת - פתיחה בדפדפן הדיפולטיבי
      await Linking.openURL(webUrl);
    }
  } catch (error) {
    console.error('AliExpress Deep Link Error:', error);
    // גיבוי פתיחה בדפדפן הרשת במקרה של תקלה
    await Linking.openURL(webUrl);
  }
}