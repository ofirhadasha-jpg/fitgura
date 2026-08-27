export interface BodyMetrics {
  estimated_height_cm?: number;
  estimated_weight_kg?: number;
  chest_circumference_cm?: number;
  waist_circumference_cm?: number;
  hips_circumference_cm?: number;
  shoulder_width_cm?: number;
}

export interface DeviceProfile {
  detected_brand: 'Apple' | 'Samsung' | 'Xiaomi' | 'Other';
  exact_model: string;
  screen_size_inches: number;
  camera_layout_type: string;
  confidence_score: number;
}

export interface SizingProfile {
  body_metrics: BodyMetrics;
  recommended_top_size: 'XS' | 'S' | 'M' | 'L' | 'XL' | 'XXL' | null;
  recommended_bottom_size: string | null;
  fit_preference: 'Slim' | 'Regular' | 'Loose' | 'Oversized';
  body_frame_estimate: 'Small' | 'Medium' | 'Large' | 'Athletic';
  confidence_score: number;
}

export interface StyleProfile {
  primary_style: string;
  secondary_style: string;
  dominant_colors: string[];
  pattern_preference: 'Solid' | 'Patterned' | 'Graphic';
  aesthetic_tags: string[];
}

export interface VendorSizeChartEntry {
  vendor_size_label: string; // למשל: "Asian XL" או "EU M"
  chest_range_cm?: [number, number];
  waist_range_cm?: [number, number];
  length_cm?: number;
  sku_id: string; // ה-SKU הספציפי של המידה הזו ב-AliExpress / Amazon
}

export interface SkuMatchResult {
  matched_vendor_size: string;
  target_sku_id: string;
  match_confidence: number;
  recommendation_note: string; // למשל: "תרגום: M ישראלי שקול ל-XL בחנות זו"
}

export interface FitguraAnalysisResponse {
  device_profile: DeviceProfile;
  sizing_profile: SizingProfile;
  style_profile: StyleProfile;
}