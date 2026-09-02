import { searchProducts } from './aliexpressClient'

export async function testAliExpressIntegration() {
  try {
    console.log('Testing AliExpress API Connection...')
    const result = await searchProducts('men jacket', 1, 5)
    console.log('AliExpress API Response Success:', JSON.stringify(result, null, 2))
    return result
  } catch (error) {
    console.error('AliExpress API Connection Failed:', error)
    throw error
  }
}
