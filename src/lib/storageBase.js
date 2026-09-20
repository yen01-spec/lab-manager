// 이 프로젝트의 Storage 공개 URL 기준 주소(…/storage/v1/object/public/). 다른 프로젝트로 복원할 때 URL 컬럼 재작성에 쓴다.
export function storageBase(client) {
  const u = client.storage.from('documents').getPublicUrl('__probe__').data?.publicUrl || ''
  return u.replace(/documents\/__probe__$/, '')
}
