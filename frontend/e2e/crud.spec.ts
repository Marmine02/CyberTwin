import { API, expect, openApp, resetDemo, test } from './fixtures'

test.describe('CRUD on the real backend', () => {
  let twinId = 0
  test.beforeAll(async ({ request }) => {
    twinId = await resetDemo(request)
  })

  const head = async (request: import('@playwright/test').APIRequestContext) =>
    (await (await request.get(`${API}/twins/${twinId}`)).json()).head_revision as number

  test('asset: validation, create, edit, delete with dependents', async ({ page, request }) => {
    await openApp(page, '/assets')
    await page.getByTestId('create-button').click()
    const dlg = page.getByTestId('entity-dialog')
    await dlg.getByTestId('entity-save').click()
    await expect(dlg.getByRole('alert').first()).toBeVisible()
    await expect(dlg).toContainText('Enter a valid IPv4 address')

    await dlg.getByTestId('f-id').fill('hr-01')
    await dlg.getByTestId('f-name').fill('HR Server')
    await dlg.getByTestId('f-ip').fill('10.0.2.30')
    await dlg.getByTestId('f-type').selectOption('app_server')
    await dlg.getByRole('button', { name: 'Add port' }).click()
    await dlg.getByLabel('Service').fill('smb')
    await dlg.getByLabel('Port', { exact: true }).fill('445')
    await dlg.getByTestId('entity-save').click()
    await expect(dlg).toBeHidden()
    await expect(page.getByTestId('toast').first()).toContainText('Saved as r2')
    await expect(page.getByTestId('row-hr-01')).toContainText('10.0.2.30')
    expect(await head(request)).toBe(2)

    // Server-side integrity error is shown specifically (duplicate IP).
    await page.getByTestId('create-button').click()
    await dlg.getByTestId('f-id').fill('dup-01')
    await dlg.getByTestId('f-name').fill('Duplicate')
    await dlg.getByTestId('f-ip').fill('10.0.2.30')
    await dlg.getByTestId('entity-save').click()
    await expect(page.getByTestId('toast').filter({ hasText: 'inconsistent' })).toBeVisible()
    await dlg.getByRole('button', { name: 'Cancel' }).click()

    // Edit
    await page.getByTestId('edit-hr-01').click()
    await dlg.getByTestId('f-criticality').fill('5')
    await dlg.getByTestId('entity-save').click()
    await expect(dlg).toBeHidden()
    expect(await head(request)).toBe(3)

    // Add a link so deleting shows dependents
    await page.getByTestId('tab-connections').click()
    await page.getByTestId('create-button').click()
    await dlg.getByTestId('f-id').fill('n-fw-int--hr-01')
    await dlg.getByLabel('Source').selectOption('fw-int')
    await dlg.getByLabel('Target').selectOption('hr-01')
    await dlg.getByTestId('entity-save').click()
    await expect(page.getByTestId('row-n-fw-int--hr-01')).toBeVisible()

    await page.getByTestId('tab-assets').click()
    await page.getByTestId('delete-hr-01').click()
    const del = page.getByTestId('delete-dialog')
    await expect(del.getByTestId('dependents')).toContainText('n-fw-int--hr-01')
    await del.getByTestId('confirm-button').click()
    await expect(page.getByTestId('row-hr-01')).toBeHidden()
    const model = await (await request.get(`${API}/twins/${twinId}/model`)).json()
    expect(model.connections.some((c: { id: string }) => c.id === 'n-fw-int--hr-01')).toBe(false)
  })

  test('principal, firewall rule and vulnerability (from catalog)', async ({ page, request }) => {
    await openApp(page, '/assets')
    const dlg = page.getByTestId('entity-dialog')
    await page.getByTestId('tab-principals').click()
    await page.getByTestId('create-button').click()
    await dlg.getByTestId('f-id').fill('contractor')
    await dlg.getByTestId('f-name').fill('Contractor')
    await dlg.getByTestId('f-strength').selectOption('weak')
    await dlg.getByTestId('entity-save').click()
    await expect(page.getByTestId('row-contractor')).toBeVisible()

    await page.getByTestId('tab-rules').click()
    await page.getByTestId('create-button').click()
    await dlg.getByTestId('f-id').fill('edge-05')
    await dlg.getByTestId('f-order').fill('10') // taken on fw-edge
    await dlg.getByTestId('entity-save').click()
    await expect(dlg).toContainText('already has a rule with this order')
    await dlg.getByTestId('f-order').fill('5')
    await dlg.getByTestId('entity-save').click()
    await expect(page.getByTestId('row-edge-05')).toBeVisible()

    await page.getByTestId('tab-vulns').click()
    await page.getByTestId('create-button').click()
    await dlg.getByTestId('f-asset').selectOption('ws-01')
    await dlg.getByTestId('f-template').selectOption('CVE-2021-4034')
    await expect(dlg.getByTestId('f-cvss')).toHaveValue('7.8')
    await dlg.getByTestId('entity-save').click()
    await expect(page.getByTestId('table-vulns')).toContainText('CVE-2021-4034')
    const model = await (await request.get(`${API}/twins/${twinId}/model`)).json()
    expect(model.vulnerabilities.find((v: { cve: string }) => v.cve === 'CVE-2021-4034').asset_id).toBe('ws-01')
    expect(model.principals.find((p: { id: string }) => p.id === 'contractor').credential_strength).toBe('weak')
  })

  test('network map: drag saves position without a revision, connect by drag, edit and delete link', async ({ page, request }) => {
    const before = await head(request)
    await openApp(page, '/map')
    const node = page.getByTestId('node-adm-ws')
    await expect(node).toBeVisible()
    const box = await node.boundingBox()
    if (!box) throw new Error('node-adm-ws has no bounding box')
    await page.mouse.move(box.x + box.width / 2, box.y + 30)
    await page.mouse.down()
    await page.mouse.move(box.x + box.width / 2 - 80, box.y + 10, { steps: 8 })
    await page.mouse.up()
    await expect.poll(async () => (await (await request.get(`${API}/twins/${twinId}/model`)).json()).positions['adm-ws'].x).not.toBe(750)
    expect(await head(request)).toBe(before)

    // Connect app-01 -> customer-db by dragging between handles
    const src = page.getByTestId('node-app-01').locator('.react-flow__handle-bottom')
    const dst = page.getByTestId('node-customer-db').locator('.react-flow__handle-top')
    await src.dragTo(dst)
    const connect = page.getByTestId('connect-dialog')
    await expect(connect).toBeVisible()
    await connect.getByTestId('connect-kind').selectOption('trust')
    await connect.getByTestId('connect-save').click()
    await expect(connect).toBeHidden()
    const m = await (await request.get(`${API}/twins/${twinId}/model`)).json()
    const link = m.connections.find((c: { source: string; target: string; kind: string }) => c.source === 'app-01' && c.target === 'customer-db')
    expect(link.kind).toBe('trust')
    expect(await head(request)).toBe(before + 1)

    // Edit label, then delete it
    await page.getByTestId(`edge-${link.id}`).locator('path').nth(1).click({ force: true })
    const edgeDlg = page.getByTestId('edge-dialog')
    await expect(edgeDlg).toBeVisible()
    await edgeDlg.getByTestId('edge-label').fill('reporting trust')
    await edgeDlg.getByTestId('edge-save').click()
    await expect(edgeDlg).toBeHidden()
    await page.getByTestId(`edge-${link.id}`).locator('path').nth(1).click({ force: true })
    await edgeDlg.getByTestId('edge-delete').click()
    await page.getByRole('dialog').getByTestId('confirm-button').click()
    await expect.poll(async () => (await (await request.get(`${API}/twins/${twinId}/model`)).json()).connections.some((c: { id: string }) => c.id === link.id)).toBe(false)

    // Drawer opens on node click
    await page.getByTestId('node-web-01').click()
    await expect(page.getByTestId('asset-drawer')).toContainText('OpenSSH')
    await page.getByTestId('drawer-close').click()
    await expect(page.getByTestId('asset-drawer')).toBeHidden()
  })
})
