<script setup lang="ts">
// Root redirect to dashboard
definePageMeta({ middleware: 'auth' })
await navigateTo('/dashboard', { replace: true })
</script>
