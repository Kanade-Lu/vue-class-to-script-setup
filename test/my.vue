<script lang="ts" setup>
import { useStore } from "vuex"

// @ts-nocheck
import { ElMessage as Message } from 'element-plus';
import { Component, Mixins } from 'vue-facing-decorator';
import { Action, Getter } from 's-vuex-class';
import cookie from '../../common/cookie';
import container from '../../components/container.vue';
import tableContent from '../../components/tableContent.vue';
import ueditorMixin from '../../mixins/ueditor.mixin';
const usedShareForm = ref();
const store = useStore()

  let tabStatus = $ref("publish");
  let isShowCenterDialogVisible = $ref(false);
  let articlesStatus = reactive({
    visible: false,
    title: '停用文章',
    articlesId: 0,
    action: 'disable'
  });
  let tokenCookie = reactive({});
  let formDataRules = reactive({
    title: [
    // 长度控制
    {
      required: true,
      message: '请输入文章标题'
    }],
    digest: [{
      required: true,
      message: '请输入文章简述'
    }],
    cover_url: [{
      required: true,
      message: '请输入文章配图'
    }],
    content: [{
      required: true,
      message: '请输入正文'
    }],
    note: [{
      required: true,
      message: '请输入备注'
    }],
    author: [{
      required: true,
      message: '请输作者'
    }]
  });
  let formData = reactive({
    action: -1,
    // # 0-公告, 1-草稿
    id: -1,
    // # optional, 如果要修改已有公告/草稿, 需要填写这个字段
    title: '',
    // 标题
    digest: '',
    // 描述
    cover_url: '',
    // 封面url
    content: '',
    // 内容
    note: '',
    // 备注
    status: 0,
    // 1、已发布 2、草稿
    author: '' // 公告作者
  });
  let coverUploadUrl = $ref("");
  let keys = $ref(['title', 'note', 'status_name', 'latest_edited_at', 'latest_editor', 'update']);
  let columns = $ref(['文章标题', '备注信息', '状态', '最后编辑时间', '操作人', '操作']);
  let searchParams = reactive({
    title: '',
    page: 1,
    count: 10
  });
  let imagesList = $ref([]);
  const createUsedShare = store.dispatch('createUsedShare')
  const getShareArticles = store.dispatch('getShareArticles')
  const getShareArticlesDetails = store.dispatch('getShareArticlesDetails')
  const updateArticlesStatus = store.dispatch('updateArticlesStatus')
  const frefixUrl = computed(() => store.getters.frefixUrl)
  const shareArticles = computed(() => store.getters.shareArticles)
  const shareArticlesNum = computed(() => store.getters.shareArticlesNum)
  tokenCookie = {
    'X-CSRF-Token': cookie.getCookie('csrf-token')
  };
  ueditorConfig.serverUrl = 'asdasdas';
  const coverUrl = computed(() => {
    return formData.cover_url || '';
  });
  const customConfig = computed(() => {
    return {
      groups: {
        template: 'groups'
      },
      update: {
        template: 'update'
      }
    };
  }); // 页签切换
const handleTabClick = () => {

    usedShareForm.resetFields();
    formData.id = -1;
    formData.status = 0;
    if (tabStatus === 'history') {
      searchParams = {
        title: '',
        page: 1,
        count: 10
      };
      getShareArticles(searchParams);
    }
  }
const handleAvatarSuccess = (images) => {
    const {
      thumbnail_image,
      upload_image
    } = images.pop();
    formData.cover_url = thumbnail_image;
    coverUploadUrl = upload_image;

    usedShareForm.validateField('cover_url');
  }
const handleSubmit = (action) => {
    let isValid = false;
    formData.action = action; // 0：发布、1：寸草稿 、2 、保存
    if (formData.status === 1) formData.action = 2; // 文章已发布状态编辑
    if (formData.status === 3) formData.action = 2; // 文章已发布状态编辑

    usedShareForm.validate(valid => {
      isValid = valid;
    });
    if (!isValid) return;
    if (formData.action === 0) isShowCenterDialogVisible = true;else handleSubmitFinaly();
  }
const handleSubmitFinaly = () => {
    isShowCenterDialogVisible = false;
    const cover_url = coverUploadUrl;
    createUsedShare({
      ...formData,
      cover_url
    }).then(res => {
      if (res.code === 0) {
        Message.success('已提交, 15秒后操作成功');

        usedShareForm.resetFields();
        tabStatus = 'history';
        handleTabClick();
      }
    });
  }

  // 文章列表模块
const handleSearch = () => {
    searchParams.page = 1;
    getShareArticles(searchParams);
  }
const handleCurrentChange = (value) => {
    searchParams.page = value;
    getShareArticles(searchParams);
  }
const handlerReEditor = (id) => {
    getShareArticlesDetails(id).then(res => {
      if (res.code === 0) {
        formData = res.data;
        formData.id = id;
        tabStatus = 'publish';
      } else {
        Message.error(res.message);
      }
    });
  }
const handlerArticlesStatus = (articlesId, action) => {
    articlesStatus.articlesId = articlesId;
    articlesStatus.action = action;
    articlesStatus.visible = true;
    articlesStatus.title = action === 'disable' ? '停用' : '启用';
  }
const handleUpdateArticlesStatus = () => {
    const params = {
      articlesId: articlesStatus.articlesId,
      operationCode: articlesStatus.action === 'disable' ? 1 : 2
    };
    updateArticlesStatus(params).then(res => {
      if (res.code === 0) {
        articlesStatus.visible = false;
        getShareArticles(searchParams);
      } else {
        Message.error(res.message);
      }
    });
   }
</script>

<template>
  <div />
</template>

<style scoped>

</style>
