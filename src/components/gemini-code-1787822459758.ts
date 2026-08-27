import { Linking } from 'react-native';

export interface AmazonCartParams {
  asin: string; // ה-ASIN הספציפי של המידה והצבע שנבחרו
  quantity?: number;
  associateTag?: string; // מזהה השותף (Affiliate Tag) שלך באמזון
}

/**
 * מנגנון פתיחה והוספה ישירה לעגלת הקניות באמזון
 */
export async function openAmazonCartWithAsin({
  asin,
  quantity = 1,
  associateTag = process.env.EXPO_PUBLIC_AMAZON_ASSOCIATE_TAG || '',
}: AmazonCartParams): Promise<void> {
  // 1. קישור הוספה ישירה לעגלת הקניות באמזון (מציג למשתמש את העגלה מוכנה לצ'ק-אאוט)
  const directCartUrl = `https://www.amazon.com/gp/aws/cart/add.html?AssociateTag=${associateTag}&ASIN.1=${asin}&Quantity.1=${quantity}`;

  // 2. Deep Link לפתיחה בתוך אפליקציית Amazon Mobile Shopping במידה ומותקנת
  const appDeepLink = `com.amazon.mobile.shopping.web://amazon.com/dp/${asin}?tag=${associateTag}`;

  try {
    // ניסיון פתיחה בתוך אפליקציית אמזון
    const canOpenApp = await Linking.canOpenURL(appDeepLink);

    if (canOpenApp) {
      await Linking.openURL(appDeepLink);
    } else {
      // במידה והאפליקציה לא מותקנת - פתיחת הקישור של העגלה הישירה בדפדפן
      await Linking.openURL(directCartUrl);
    }
  } catch (error) {
    console.error('Amazon Deep Link Error:', error);
    // גיבוי פתיחה בדפדפן
    await Linking.openURL(directCartUrl);
  }
}