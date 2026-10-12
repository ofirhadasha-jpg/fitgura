import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { FamilyMember } from '../types'

export type ProductTarget = 'women' | 'men' | 'kids' | 'baby' | 'unisex' | 'unknown'

export function detectProductTarget(
  productName: string,
  category: string,
  url: string,
): ProductTarget {
  const text = `${productName} ${category} ${url}`.toLowerCase()

  const kidsPatterns = ['kids', 'kid', 'children', "child's", 'girl ', 'boy ', 'girls', 'boys', 'ילדים', 'ילד', 'ילדה', 'בנים', 'בנות', 'baby', 'infant', 'toddler', 'תינוק', 'פעוט', 'babies']
  const womenPatterns = ['women', "women's", 'woman', 'ladies', 'female', 'נשים', 'אשה', 'נשי', 'בגדי נשים', 'גזרת נשים', 'womens']
  const menPatterns = ['men', "men's", 'man', 'male', 'גברים', 'גבר', 'בגדי גברים', 'mens']
  const unisexPatterns = ['unisex', 'יוניסקס', 'לשני המינים']

  if (unisexPatterns.some((p) => text.includes(p))) return 'unisex'
  if (kidsPatterns.some((p) => text.includes(p))) {
    if (text.includes('baby') || text.includes('infant') || text.includes('תינוק')) return 'baby'
    return 'kids'
  }
  if (womenPatterns.some((p) => text.includes(p))) return 'women'
  if (menPatterns.some((p) => text.includes(p))) return 'men'
  return 'unknown'
}

export interface CategoryMismatch {
  productTarget: ProductTarget
  profileGender: 'male' | 'female' | 'unisex'
  profileAgeGroup: string
  profileName: string
  mismatchType: 'gender' | 'age'
  title: string
  body: string
  switchProfileName: string | null
  switchProfileId: string | null
}

export function checkCategoryMismatch(
  productTarget: ProductTarget,
  profileGender: 'male' | 'female' | 'unisex',
  profileAgeGroup: string,
  profileName: string,
  familyMembers: FamilyMember[],
): CategoryMismatch | null {
  if (productTarget === 'unknown' || productTarget === 'unisex') return null

  const isAdultProfile = profileAgeGroup === 'adult' || profileAgeGroup === 'teen'
  const isChildProfile = profileAgeGroup === 'child' || profileAgeGroup === 'toddler' || profileAgeGroup === 'baby'

  // Kids/Baby item for an adult profile
  if ((productTarget === 'kids' || productTarget === 'baby') && isAdultProfile) {
    const childMember = familyMembers.find((m) => m.category === 'child' || m.category === 'baby')
    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'age',
      title: productTarget === 'baby' ? 'רגע... אלה בגדי תינוק! 👶' : 'רגע... אלה בגדי ילדים! 🧒',
      body: `לפי הפרופיל שלך המידות הן של מבוגר, אבל הפריט הזה מיועד ל${productTarget === 'baby' ? 'תינוקות' : 'ילדים'}. מיועד כמתנה לילד? ✨`,
      switchProfileName: childMember?.name ?? null,
      switchProfileId: childMember?.id ?? null,
    }
  }

  // Adult gendered item for a child profile
  if ((productTarget === 'women' || productTarget === 'men') && isChildProfile) {
    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'age',
      title: productTarget === 'women' ? 'רגע... אלה בגדי נשים! 👗' : 'רגע... אלה בגדי גברים! 👔',
      body: `הפריט הזה מיועד ל${productTarget === 'women' ? 'נשים בוגרות' : 'גברים בוגרים'}, אבל הפרופיל הפעיל שייך לילד. האם זה רכישה למבוגר?`,
      switchProfileName: null,
      switchProfileId: null,
    }
  }

  // Gender mismatch for adult profiles
  if (productTarget === 'women' && profileGender === 'male') {
    const partnerMember = familyMembers.find((m) => m.category === 'partner')
    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'gender',
      title: 'רגע... אלה בגדי נשים! 👗',
      body: `לפי הפרופיל שלך המידות הן של גבר, אבל הפריט הזה מעוצב בגזרת נשים. מיועד כמתנה? ✨`,
      switchProfileName: partnerMember?.name ?? null,
      switchProfileId: partnerMember?.id ?? null,
    }
  }

  if (productTarget === 'men' && profileGender === 'female') {
    const partnerMember = familyMembers.find((m) => m.category === 'partner')
    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'gender',
      title: 'רגע... אלה בגדי גברים! 👔',
      body: `לפי הפרופיל שלך המידות הן של אישה, אבל הפריט הזה מעוצב בגזרת גברים. מיועד כמתנה? ✨`,
      switchProfileName: partnerMember?.name ?? null,
      switchProfileId: partnerMember?.id ?? null,
    }
  }

  return null
}

interface CategoryMismatchModalProps {
  visible: boolean
  mismatch: CategoryMismatch | null
  onSwitchProfile: (profileId: string) => void
  onOverride: () => void
  onClose: () => void
}

export default function CategoryMismatchModal({
  visible,
  mismatch,
  onSwitchProfile,
  onOverride,
  onClose,
}: CategoryMismatchModalProps) {
  if (!visible || !mismatch) return null

  const canSwitch = mismatch.switchProfileId !== null

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{mismatch.productTarget === 'women' ? '👗' : mismatch.productTarget === 'men' ? '👔' : mismatch.productTarget === 'baby' ? '👶' : '🧒'}</Text>
        </View>
        <Text style={styles.title}>{mismatch.title}</Text>
        <Text style={styles.body}>{mismatch.body}</Text>

        {canSwitch && (
          <TouchableOpacity
            onPress={() => mismatch.switchProfileId && onSwitchProfile(mismatch.switchProfileId)}
            activeOpacity={0.8}
            style={styles.switchBtn}
          >
            <Text style={styles.switchBtnText}>
              {mismatch.mismatchType === 'gender'
                ? `העבר לניתוח עבור ${mismatch.switchProfileName} 💍`
                : `העבר לניתוח עבור ${mismatch.switchProfileName} 🎁`}
            </Text>
          </TouchableOpacity>
        )}

        {!canSwitch && (
          <Text style={styles.noSwitchHint}>לא נמצא פרופיל מתאים — אפשר להוסיף פרופיל בכרטיסיית הפרופילים</Text>
        )}

        <TouchableOpacity
          onPress={onOverride}
          activeOpacity={0.7}
          style={styles.overrideBtn}
        >
          <Text style={styles.overrideBtnText}>חשב בכל זאת לפי המידות שלי 📏</Text>
        </TouchableOpacity>

        <TouchableOpacity
          onPress={onClose}
          activeOpacity={0.6}
          style={styles.cancelBtn}
        >
          <Text style={styles.cancelBtnText}>ביטול</Text>
        </TouchableOpacity>
      </View>
    </View>
  )
}

const styles = StyleSheet.create({
  overlay: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 450, justifyContent: 'center', alignItems: 'center' },
  backdrop: { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(26,26,26,0.7)' },
  panel: { backgroundColor: '#FFFEF5', borderRadius: 22, padding: 24, width: '90%', maxWidth: 400, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, alignItems: 'center' } as any,
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A', marginBottom: 14 },
  icon: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 10, fontFamily: "'Permanent Marker', cursive" },
  body: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', lineHeight: 22, marginBottom: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  switchBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, width: '100%', marginBottom: 10 } as any,
  switchBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  overrideBtn: { backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFE566', width: '100%', marginBottom: 8 },
  overrideBtnText: { color: '#4A4A4A', fontSize: 14, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  noSwitchHint: { fontSize: 13, color: '#9A9A9A', marginBottom: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 14, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
})
