import { cosineSimilarity } from './rag.js';

console.log('🧪 [TestSimilarity] 开始测试 cosineSimilarity...');

const vecA = [1, 0, 0];
const vecB = [0, 1, 0];
const vecC = [1, 1, 0];

const simAB = cosineSimilarity(vecA, vecB);
const simAC = cosineSimilarity(vecA, vecC);
const simCC = cosineSimilarity(vecC, vecC);

console.log('🔢 [TestSimilarity] sim(A,B) 预期接近 0:', simAB);
console.log('🔢 [TestSimilarity] sim(A,C) 预期介于 0 与 1:', simAC);
console.log('🔢 [TestSimilarity] sim(C,C) 预期接近 1:', simCC);

const inRange =
  simAB >= -0.000001 &&
  simAB <= 1.000001 &&
  simAC >= -0.000001 &&
  simAC <= 1.000001 &&
  simCC >= -0.000001 &&
  simCC <= 1.000001;

console.log(`✅ [TestSimilarity] 相似度范围检查: ${inRange ? 'OK' : 'FAIL'}`);
console.log('🎉 [TestSimilarity] 测试结束。');
