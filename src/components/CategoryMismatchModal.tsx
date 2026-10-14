import React from 'react'
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native'
import type { FamilyMember } from '../types'

export type ProductTarget = 'women' | 'men' | 'boys' | 'girls' | 'kids' | 'baby' | 'unisex' | 'unknown'

export interface SwitchOption {
  id: string
  name: string
  emoji: string
}

export function detectProductTarget(
  productName: string,
  category: string,
  url: string,
): ProductTarget {
  const text = `${productName} ${category} ${url}`.toLowerCase()

  const unisexPatterns = ['unisex', 'יוניסקס', 'לשני המינים']
  if (unisexPatterns.some((p) => text.includes(p))) return 'unisex'

  const babyPatterns = ['baby', 'infant', 'newborn', 'toddler', 'babies', 'תינוק', 'תינוקות', 'פעוט', 'פעוטות', ' newborn', '0-3 months', '0-24 months']
  if (babyPatterns.some((p) => text.includes(p))) return 'baby'

  const boyPatterns = ["boy's", ' boys', 'boys ', 'for boys', 'ילד', 'בנים', 'לבנים', 'boy ']
  const girlPatterns = ["girl's", ' girls', 'girls ', 'for girls', 'ילדה', 'בנות', 'לבנות', 'girl ']

  const kidsPatterns = ['kids', "kid's", 'kid', 'children', "child's", 'child', 'ילדים', 'ילדים/', 'clothing kids']
  if (boyPatterns.some((p) => text.includes(p))) return 'boys'
  if (girlPatterns.some((p) => text.includes(p))) return 'girls'
  if (kidsPatterns.some((p) => text.includes(p))) return 'kids'

  const womenPatterns = ['women', "women's", 'woman', 'ladies', 'female', 'womens', 'נשים', 'אשה', 'אישה', 'נשי', 'בגדי נשים', 'גזרת נשים', 'לנשים']
  if (womenPatterns.some((p) => text.includes(p))) return 'women'

  const menPatterns = ['men', "men's", 'man', 'male', 'mens', 'גברים', 'גבר', 'בגדי גברים', 'לגברים']
  if (menPatterns.some((p) => text.includes(p))) return 'men'

  return 'unknown'
}

export interface SmartMatch {
  profileId: string
  profileName: string
  recommendedSize: string
  matchPercentage: number
  emoji: string
}

export interface CategoryMismatch {
  productTarget: ProductTarget
  profileGender: 'male' | 'female' | 'unisex'
  profileAgeGroup: string
  profileName: string
  mismatchType: 'gender' | 'age'
  title: string
  body: string
  icon: string
  switchOptions: SwitchOption[]
  canAddProfile: boolean
  addProfileLabel: string
  smartMatch: SmartMatch | null
}

function isAdult(ageGroup: string): boolean {
  return ageGroup === 'adult' || ageGroup === 'teen'
}

function isChild(ageGroup: string): boolean {
  return ageGroup === 'child' || ageGroup === 'toddler'
}

function isBaby(ageGroup: string): boolean {
  return ageGroup === 'baby'
}

function findChildProfiles(members: FamilyMember[]): FamilyMember[] {
  return members.filter((m) => m.category === 'child' || m.category === 'baby')
}

function findPartnerProfiles(members: FamilyMember[]): FamilyMember[] {
  return members.filter((m) => m.category === 'partner')
}

export function checkCategoryMismatch(
  productTarget: ProductTarget,
  profileGender: 'male' | 'female' | 'unisex',
  profileAgeGroup: string,
  profileName: string,
  familyMembers: FamilyMember[],
): CategoryMismatch | null {
  if (productTarget === 'unknown' || productTarget === 'unisex') return null

  const adult = isAdult(profileAgeGroup)
  const child = isChild(profileAgeGroup)
  const baby = isBaby(profileAgeGroup)

  // --- Kids/Baby/Boys/Girls item on an adult profile ---
  if ((productTarget === 'kids' || productTarget === 'baby' || productTarget === 'boys' || productTarget === 'girls') && adult) {
    const childMembers = findChildProfiles(familyMembers)
    const switchOptions: SwitchOption[] = childMembers.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: m.category === 'baby' ? '👶' : '🧒',
    }))

    const isBabyTarget = productTarget === 'baby'
    const isKidsTarget = productTarget === 'boys' || productTarget === 'girls' || productTarget === 'kids'

    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'age',
      icon: isBabyTarget ? '👶' : '🧒',
      title: isBabyTarget ? 'רגע... זה בגד קטנטן! 👶🎈' : 'רגע... זה בגד של ילד/ה! 🧒',
      body: 'לפי המידות שלך הפריט הזה יהיה קצת צפוף... אם זה מיועד לאחד הילדים, העבר את הניתוח לפרופיל שלהם!',
      switchOptions,
      canAddProfile: true,
      addProfileLabel: 'הוסף פרופיל ילד/ה ➕',
      smartMatch: null,
    }
  }

  // --- Kids/Baby item on a child profile (but different sub-age) ---
  if ((productTarget === 'baby') && child) {
    const babyMembers = familyMembers.filter((m) => m.category === 'baby')
    const switchOptions: SwitchOption[] = babyMembers.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: '👶',
    }))

    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'age',
      icon: '👶',
      title: 'רגע... זה בגד קטנטן! 👶🎈',
      body: 'הפריט הזה מיועד לתינוקות, אבל הפרופיל הפעיל שייך לילד גדול יותר. אולי זה לתינוק במשפחה?',
      switchOptions,
      canAddProfile: true,
      addProfileLabel: 'הוסף פרופיל תינוק ➕',
      smartMatch: null,
    }
  }

  // --- Adult gendered item (men/women) on a child or baby profile ---
  if ((productTarget === 'women' || productTarget === 'men') && (child || baby)) {
    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'age',
      icon: productTarget === 'women' ? '👗' : '👔',
      title: 'רגע... זה ענקי! 👕',
      body: 'המוצר הזה מעוצב במידות של מבוגרים. אולי התכוונת לחפש בשבילך?',
      switchOptions: [],
      canAddProfile: false,
      addProfileLabel: '',
      smartMatch: null,
    }
  }

  // --- Gender mismatch: Women's item on a Male adult profile ---
  if (productTarget === 'women' && profileGender === 'male' && adult) {
    const partners = findPartnerProfiles(familyMembers)
    const femalePartners = partners.filter((m) => {
      const sizes = m.scannedSizes
      return sizes?.gender === 'female' || sizes?.gender === 'unisex' || sizes == null
    })
    const switchOptions: SwitchOption[] = femalePartners.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: '💍',
    }))

    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'gender',
      icon: '👗',
      title: 'רגע... אלה בגדי נשים! 👗',
      body: 'הגזרה הזו מיועדת למגדר השני. מיועד כמתנה?',
      switchOptions,
      canAddProfile: switchOptions.length === 0,
      addProfileLabel: 'הוסף פרופיל פרטנר/ה ➕',
      smartMatch: null,
    }
  }

  // --- Gender mismatch: Men's item on a Female adult profile ---
  if (productTarget === 'men' && profileGender === 'female' && adult) {
    const partners = findPartnerProfiles(familyMembers)
    const malePartners = partners.filter((m) => {
      const sizes = m.scannedSizes
      return sizes?.gender === 'male' || sizes?.gender === 'unisex' || sizes == null
    })
    const switchOptions: SwitchOption[] = malePartners.map((m) => ({
      id: m.id,
      name: m.name,
      emoji: '💍',
    }))

    return {
      productTarget,
      profileGender,
      profileAgeGroup,
      profileName,
      mismatchType: 'gender',
      icon: '👔',
      title: 'רגע... אלה בגדי גברים! 👔',
      body: 'הגזרה הזו מיועדת למגדר השני. מיועד כמתנה?',
      switchOptions,
      canAddProfile: switchOptions.length === 0,
      addProfileLabel: 'הוסף פרופיל פרטנר/ה ➕',
      smartMatch: null,
    }
  }

  // --- Boys item on a Female adult (could be for a son) ---
  if ((productTarget === 'boys' || productTarget === 'girls') && adult) {
    // Already handled above by kids/baby check, but catch edge case where
    // boys/girls slipped through because ageGroup logic didn't fire
    return null
  }

  return null
}

interface CategoryMismatchModalProps {
  visible: boolean
  mismatch: CategoryMismatch | null
  onSwitchProfile: (profileId: string) => void
  onAddProfile: () => void
  onSmartMatchSave: (profileId: string) => void
  onOverride: () => void
  onClose: () => void
}

export default function CategoryMismatchModal({
  visible,
  mismatch,
  onSwitchProfile,
  onAddProfile,
  onSmartMatchSave,
  onOverride,
  onClose,
}: CategoryMismatchModalProps) {
  if (!visible || !mismatch) return null

  const hasSwitchOptions = mismatch.switchOptions.length > 0
  const hasSmartMatch = mismatch.smartMatch !== null

  return (
    <View style={styles.overlay}>
      <TouchableOpacity onPress={onClose} activeOpacity={1} style={styles.backdrop} />
      <View style={styles.panel}>
        <View style={styles.iconWrap}>
          <Text style={styles.icon}>{mismatch.icon}</Text>
        </View>
        <Text style={styles.title}>{mismatch.title}</Text>
        <Text style={styles.body}>{mismatch.body}</Text>

        {/* Smart match card - auto-computed best family match */}
        {hasSmartMatch && mismatch.smartMatch && (
          <View style={styles.smartMatchCard}>
            <Text style={styles.smartMatchTitle}>רגע... זה לא בדיוק הסטייל/המידה שלך {mismatch.icon}</Text>
            <Text style={styles.smartMatchBody}>
              אבל בדקנו מול המשפחה: הפריט הזה מתאים בול ל{'\n'}
              <Text style={styles.smartMatchName}>{mismatch.smartMatch.profileName}</Text>
              {' '}במידה <Text style={styles.smartMatchSize}>{mismatch.smartMatch.recommendedSize}</Text>
              {' '}({mismatch.smartMatch.matchPercentage}% התאמה)! ✨
            </Text>
            <TouchableOpacity
              onPress={() => onSmartMatchSave(mismatch.smartMatch!.profileId)}
              activeOpacity={0.8}
              style={styles.smartMatchSaveBtn}
            >
              <Text style={styles.smartMatchSaveBtnText}>
                שמור בארון של {mismatch.smartMatch.profileName} 💖
              </Text>
            </TouchableOpacity>
          </View>
        )}

        {/* Dynamic profile switch buttons */}
        {hasSwitchOptions && (
          <View style={styles.switchOptionsWrap}>
            {mismatch.switchOptions.map((opt) => (
              <TouchableOpacity
                key={opt.id}
                onPress={() => onSwitchProfile(opt.id)}
                activeOpacity={0.8}
                style={styles.switchBtn}
              >
                <Text style={styles.switchBtnText}>
                  העבר לניתוח עבור {opt.name} {opt.emoji}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
        )}

        {/* Add profile button when no matching profiles exist */}
        {mismatch.canAddProfile && (
          <TouchableOpacity
            onPress={onAddProfile}
            activeOpacity={0.7}
            style={styles.addProfileBtn}
          >
            <Text style={styles.addProfileBtnText}>{mismatch.addProfileLabel}</Text>
          </TouchableOpacity>
        )}

        {/* No options hint when nothing is available */}
        {!hasSwitchOptions && !mismatch.canAddProfile && (
          <Text style={styles.noSwitchHint}>לא נמצא פרופיל מתאים — אפשר להוסיף פרופיל בכרטיסיית הפרופילים</Text>
        )}

        {/* Override - always available */}
        <TouchableOpacity
          onPress={onOverride}
          activeOpacity={0.7}
          style={styles.overrideBtn}
        >
          <Text style={styles.overrideBtnText}>חשב בכל זאת לפי המידות הנוכחיות 📏</Text>
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
  panel: { backgroundColor: '#FFFEF5', borderRadius: 22, padding: 24, width: '90%', maxWidth: 400, borderWidth: 2, borderColor: '#1A1A1A', boxShadow: '4px 4px 0 #1A1A1A' as any, alignItems: 'center', maxHeight: '90%', overflowY: 'auto' } as any,
  iconWrap: { width: 64, height: 64, borderRadius: 32, backgroundColor: '#FFE566', alignItems: 'center', justifyContent: 'center', borderWidth: 2, borderColor: '#1A1A1A', marginBottom: 14 },
  icon: { fontSize: 32 },
  title: { fontSize: 20, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 10, fontFamily: "'Permanent Marker', cursive" },
  body: { fontSize: 15, color: '#4A4A4A', textAlign: 'center', lineHeight: 22, marginBottom: 20, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  switchOptionsWrap: { width: '100%', gap: 8, marginBottom: 8 },
  switchBtn: { backgroundColor: '#00CC52', borderRadius: 14, paddingVertical: 14, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '3px 3px 0 #1A1A1A' as any, width: '100%' } as any,
  switchBtnText: { color: '#1A1A1A', fontSize: 15, fontWeight: '800', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
  addProfileBtn: { backgroundColor: '#E0F2FE', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#0891B2', width: '100%', marginBottom: 8 },
  addProfileBtnText: { color: '#0891B2', fontSize: 14, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  overrideBtn: { backgroundColor: '#FFFACC', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#FFE566', width: '100%', marginBottom: 8 },
  overrideBtnText: { color: '#4A4A4A', fontSize: 14, fontWeight: '700', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  noSwitchHint: { fontSize: 13, color: '#9A9A9A', marginBottom: 16, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive", textAlign: 'center' },
  cancelBtn: { paddingVertical: 8, paddingHorizontal: 16 },
  cancelBtnText: { fontSize: 14, color: '#9A9A9A', fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  smartMatchCard: { backgroundColor: '#E0FFF0', borderRadius: 16, padding: 16, borderWidth: 2, borderColor: '#00CC52', width: '100%', marginBottom: 14, alignItems: 'center' } as any,
  smartMatchTitle: { fontSize: 16, fontWeight: '800', color: '#1A1A1A', textAlign: 'center', marginBottom: 8, fontFamily: "'Permanent Marker', cursive" },
  smartMatchBody: { fontSize: 14, color: '#1A1A1A', textAlign: 'center', lineHeight: 22, marginBottom: 12, fontFamily: "'Caveat', 'Noto Sans Hebrew', cursive" },
  smartMatchName: { fontSize: 18, fontWeight: '800', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  smartMatchSize: { fontSize: 18, fontWeight: '800', color: '#00CC52', fontFamily: "'Permanent Marker', cursive" },
  smartMatchSaveBtn: { backgroundColor: '#00CC52', borderRadius: 12, paddingVertical: 12, paddingHorizontal: 20, alignItems: 'center', borderWidth: 1.5, borderColor: '#1A1A1A', boxShadow: '2px 2px 0 #1A1A1A' as any, width: '100%' } as any,
  smartMatchSaveBtnText: { color: '#1A1A1A', fontSize: 14, fontWeight: '800', fontFamily: "'Permanent Marker', cursive", textAlign: 'center' },
})
