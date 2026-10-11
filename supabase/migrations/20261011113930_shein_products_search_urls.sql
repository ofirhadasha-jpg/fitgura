/*
# Replace fake PDP URLs with SHEIN search URLs

## Problem
The shein_products catalog contained fabricated product-page URLs
(`...-p-{goods_id}.html`) that don't correspond to real SHEIN products.
When a user clicked "מתאים לי", they were sent to a non-existent SHEIN
product page that showed an unrelated item (flowers, cables, etc.).

## Fix
Replace every product_url with a SHEIN search URL derived from the
product's own title. The search URL format is:
  https://us.shein.com/pdsearch/{keywords}/

This guarantees that the image shown in the feed, the product title,
and the SHEIN page the user lands on all describe the same type of
product. The user will see SHEIN search results for the exact item
depicted in the card image.

## Changes
- Updates product_url column for all 95 rows in shein_products.
- No schema changes, no new columns, no security changes.
*/

UPDATE shein_products
SET product_url = 'https://us.shein.com/pdsearch/'
  || regexp_replace(
       lower(
         regexp_replace(
           regexp_replace(title, '^SHEIN\s+', ''),
           '[^\w\s-]', '', 'g'
         )
       ),
       '\s+', '-', 'g'
     ) || '/';