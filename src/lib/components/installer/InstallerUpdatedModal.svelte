<script lang="ts">
  import AppModal from '$lib/components/AppModal.svelte';
  import InstallerUpdateHighlights from '$lib/components/InstallerUpdateHighlights.svelte';
  import { locale } from '$lib/locale';

  export let open: boolean;
  export let onConfirm: () => void | Promise<void>;
  export let onCancel: () => void | Promise<void>;
</script>

<AppModal
  {open}
  eyebrow="BazaarPlusPlus"
  title={$locale === 'zh' ? '安装器已更新' : 'Installer Updated'}
  wide={true}
  confirmText={$locale === 'zh' ? '重新安装' : 'Reinstall'}
  showCancel={true}
  cancelText={$locale === 'zh' ? '稍后' : 'Later'}
  {onConfirm}
  {onCancel}
>
  <InstallerUpdateHighlights />
  <a class="update-detail-link" href="/whats-new">
    {$locale === 'zh' ? '在独立页面查看这部分内容' : 'Open this section on a dedicated page'}
  </a>
</AppModal>

<style>
  .update-detail-link {
    display: inline-flex;
    align-items: center;
    justify-content: center;
    margin-top: 0.15rem;
    padding: 0.62rem 0.85rem;
    border: 1px solid rgba(180, 130, 48, 0.18);
    border-radius: 999px;
    background: rgba(200, 148, 55, 0.05);
    color: rgba(228, 216, 191, 0.76);
    font-family: 'Cinzel', serif;
    font-size: 0.58rem;
    letter-spacing: 0.14em;
    text-transform: uppercase;
    text-decoration: none;
  }

  .update-detail-link:hover {
    background: rgba(200, 148, 55, 0.12);
    border-color: rgba(200, 148, 55, 0.34);
    color: rgba(240, 222, 185, 0.92);
  }
</style>
