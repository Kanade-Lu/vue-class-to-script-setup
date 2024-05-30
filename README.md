# vue-class → script setup

使用方式  
npm run build  
pnpm link --global  

vue-class-to-vue3 yourFileNameOrFolder  
or   
vue-class-to-vue3    
输入待转换的文件或者文件夹: yourFileNameOrFolder


## 支持的选项
### --toPinia （vue-class-to-vue3 yourFileNameOrFolder --toPinia）
将插件转换后的vuex代码转换成pinia，由于pinia本身具备的namespace属性，所以只能将用了namespace的vuex代码进行转换.


需要注意的点：

1. Mixin 由于在vue3里面已经建议用compositionApi代替，并且在script setup中已经取消了支持，所以无法直接完成转换，可以使用工具对mixin进行转换后更改成compositionApi后手动导入。
2. vModel在vue2和vue3的双向绑定实现具有差异，请留意转换后是否仍然符合预期。
3. @Emit(”callback”) callbackFun 的转换只会变成 const emit = defineEmits([’callback’]),如果在代码里使用了 callbackFun(), 请自行改为emit(’callback’)。暂时不支持自动转换
4. 需要注意的是，某些写法在vue-class是可行的，但是在vue-setup下转换后会有问题，例：

```ts
test = 1
changeTest(test) {
    this.test = test
}

=>
// Bug
const test = ref(1)
function changeTest(test) {
    test.value = test
}
```


#
## 2024-05-30
- 支持options转换为setup模式
- 支持mixins-options转换为useHook（仅支持 .js文件）
