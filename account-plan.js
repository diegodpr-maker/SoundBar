export const PLAN_PRICE=29.90;
export function canUpload(access){return access?.status==='approved'&&(access.is_admin===true||access.plan==='pro'&&access.can_upload===true)}
export function requireUpload(access){if(!canUpload(access))throw Object.assign(Error('Envio de áudios disponível no plano Pro.'),{status:403,code:'PLAN_REQUIRED'});return true}
export function planLabel(access){return access?.is_admin?'Administrador':access?.plan==='pro'?'Pro':'Free'}
