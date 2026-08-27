import React from 'react';
import { TouchableOpacity, Text, StyleSheet } from 'react-native';
import { openAmazonCartWithAsin } from '../services/amazonDeepLinkService';

interface AmazonBuyButtonProps {
  matchedAsin: string; // ה-ASIN המדויק שהוחזר מ-matchUserToVendorSku
  displaySize: string; // למשל: "מידה מותאמת: L"
}

export const FitguraAmazonBuyButton: React.FC<AmazonBuyButtonProps> = ({
  matchedAsin,
  displaySize,
}) => {
  const handlePurchase = async () => {
    await openAmazonCartWithAsin({
      asin: matchedAsin,
      quantity: 1,
    });
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handlePurchase}>
      <Text style={styles.buttonText}>
        קנה עכשיו ב-Amazon ({displaySize})
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF9900', // צבע אמזון רשמי
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#111111',
    fontWeight: 'bold',
    fontSize: 16,
  },
});