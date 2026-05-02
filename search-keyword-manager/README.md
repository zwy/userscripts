# Search Keyword Manager

个人搜索词管理器 Tampermonkey 脚本。

## 功能

- **添加 / 删除**搜索词
- **点击复制**到剪贴板（自动记录使用次数）
- **按使用次数排序**（默认），支持切换「最近使用」/「字母顺序」
- **导入 / 导出** JSON 文件，方便多设备同步
- **自动检测**页面是否存在搜索框，有才显示悬浮按钮（减少干扰）
- 悬浮按钮**可拖拽**移位，位置自动保存
- 支持 **亮色 / 暗色** 主题（跟随系统）

## 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 浏览器扩展
2. 点击下方链接直接安装脚本：

   [安装脚本](https://raw.githubusercontent.com/zwy/userscripts/main/search-keyword-manager/search-keyword-manager.user.js)

## 使用说明

1. 访问任意**含有搜索框的网页**，右下角会出现蓝绿色圆形按钮 🔍
2. 点击按钮打开管理面板
3. 在输入框中输入搜索词，按 `Enter` 或点击「添加」
4. 点击搜索词即可**复制到剪贴板**，可直接粘贴到搜索框
5. 使用次数会自动累计，面板默认按次数由多到少排序

## 导入 / 导出格式

```json
[
  {
    "id": "abc123",
    "text": "搜索词示例",
    "count": 5,
    "addedAt": 1700000000000,
    "lastUsed": 1700001000000
  }
]
```

> 导入时只需保留 `text` 字段即可，其余字段可选。
