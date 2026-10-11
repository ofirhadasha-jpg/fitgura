// src/components/FeedScreen.tsx
import React, { useEffect, useState } from 'react';
import { getFilteredSheinFeed, Product } from '../services/sheinAdapter';

export const FeedScreen: React.FC = () => {
  const [products, setProducts] = useState<Product[]>([]);
  const [loading, setLoading] = useState<boolean>(true);

  const loadFreshFeed = async () => {
    setLoading(true);
    try {
      // Clear session cache flag to force fresh rotation
      sessionStorage.removeItem('fitgura_feed_cache');
      
      const freshProducts = await getFilteredSheinFeed();
      setProducts(freshProducts);
    } catch (err) {
      console.error('Failed to load fresh feed', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Trigger fresh load on component mount (every time user enters the app/feed)
    loadFreshFeed();

    // Optional: Listen to window focus to refresh when returning to tab
    const handleFocus = () => {
      loadFreshFeed();
    };
    window.addEventListener('focus', handleFocus);
    return () => window.removeEventListener('focus', handleFocus);
  }, []);

  return (
    <div className="p-4">
      <div className="flex justify-between items-center mb-4">
        <h2 className="text-xl font-bold">הפיד המותאם לך</h2>
        <button 
          onClick={loadFreshFeed}
          className="text-sm bg-gray-100 px-3 py-1 rounded-lg hover:bg-gray-200 transition"
        >
          רענן פיד 🔄
        </button>
      </div>

      {loading ? (
        <div className="text-center py-10">טוען פריטים חדשים בשבילך...</div>
      ) : (
        <div className="grid grid-cols-2 gap-4">
          {products.map((product) => (
            <div key={product.id} className="border rounded-xl p-3 shadow-sm bg-white">
              <img src={product.imageUrl} alt={product.title} className="w-full h-48 object-cover rounded-lg mb-2" />
              <h3 className="text-sm font-semibold truncate">{product.title}</h3>
              <div className="flex justify-between items-center mt-2">
                <span className="text-lg font-bold text-black">₪{product.primaryOffer.price}</span>
                <a
                  href={product.primaryOffer.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="bg-black text-white px-3 py-1.5 rounded-lg text-xs font-medium hover:bg-gray-800"
                >
                  מתאים לי ✨
                </a>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};