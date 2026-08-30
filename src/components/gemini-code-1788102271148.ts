import React from 'react';
import { TouchableOpacity, Text, StyleShet } from 'react-native';
import { openAliExpressCartWithSku } from '../services/deepLinkService';

interface BuyButtonProps {
  productId: string;
  targetSkuId: string; // ה-SKU שנבחר על ידי מנוע ה-AI
  displaySize: string; // למשל: "מידה מותאמת: Asian XL"
}

export const FitguraBuyButton: React.FC<BuyButtonProps> = ({
  productId,
  targetSkuId,
  displaySize,
}) => {
  const handlePurchase = async () => {
    await openAliExpressCartWithSku({
      productId,
      skuId: targetSkuId,
      quantity: 1,
    });
  };

  return (
    <TouchableOpacity style={styles.button} onPress={handlePurchase}>
      <Text style={styles.buttonText}>
        הוסף לעגלה ב-AliExpress ({displaySize})
      </Text>
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  button: {
    backgroundColor: '#FF4747',
    padding: 16,
    borderRadius: 8,
    alignItems: 'center',
  },
  buttonText: {
    color: '#FFFFFF',
    fontWeight: 'bold',
    fontSize: 16,
  },
});