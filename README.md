# vue-class → script setup

使用方式  
npm run build  
pnpm link --global  

vue-class-to-vue3 ${fileName}
or
vue-class-to-vue3
输入待转换的文件或者文件夹: ${fileName}



需要注意的点：

1. Mixin 由于在vue3里面已经建议用compositionApi代替，并且在script setup中已经取消了支持，所以无法直接完成转换，可以使用工具对mixin进行转换后更改成compositionApi后手动导入。
2. vModel在vue2和vue3的双向绑定实现具有差异，请留意转换后是否仍然符合预期。
3. 部分类型会丢失
4. 不支持 $filters，vue3已经去掉了这个语法，请使用函数代替
5. 暂时未支持toRefs(props) 之后的 属性加.value
6. @Emit(”callback”) callbackFun 的转换只会变成 const emit = defineEmits([’callback’]),如果在代码里使用了 callbackFun(), 请自行改为emit(’callback’)。暂时不支持自动转换
目前已经实现的转换

| 待转换的代码 | 转换后的代码 |
| --- | --- |
| created | 在script setup 内相当于直接拿掉 created() {} |
| mounted | onMounted |
| ClassProperty | ref / reactive |
| Get(classMethod) | Computed |
| vuex-class处理 | 如果存在使用vuex-class,则会删除相应的import。改为使用 import { useStore } from "vuex”。 |
| this.$ \|\| this. | 去除 |
| vue-router | useRouter/useRoute |
| @Component | 去掉 |
| @Props |  defineProps |
| `<script >` | `<script setup>` |
| 函数 | 转为箭头函数 |
| this.$refs.$1 | const $1 = ref() |
| @Model | defineModel |
| ref和computed在使用时的转换 | 收集所有computed和ref，在使用的后面添加.value |
| @Ref($1) $2 | const $2 = ref() |
| @Emit | const emit = defineEmits |
| @Component({ props: {} }) | const {} = defineProps |