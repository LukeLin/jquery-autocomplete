/**
 * 搜索
 * Created by Luke on 2015/1/7.
 */
var AutoComplete = (function(){

    function isLengthUnit(x){
        return /^[+=]?(?:\d*\.?)\d+(?:px|em|rem)$/.test(x);
    }

    function AutoComplete(opts){
        // 输入框
        this.$input = $(opts.input);
        // 指定显示层的宽高和坐标
        this.width = opts.width;
        this.height = opts.height;
        this.x = isLengthUnit(opts.x) && opts.x;
        this.y = isLengthUnit(opts.y) && opts.y;
        this.noMatchTpl = opts.noMatchTpl;
        this.delay = typeof opts.delay === 'number' ? opts.delay : 500;
        this.fold = opts.fold || false;

        // 是否生成显示层容器
        if(opts.wrapper) this.wrapper = opts.wrapper;
        else {
            this.wrapper = $('<div class="im-searchbar-wrapper' + (opts.className ? ' ' + opts.className : '') + '" style="display:none;"></div>');
            this.wrapper.appendTo(document.body);
        }

        // 使用字典树保存不匹配的关键字
        this.lastNoMatchKey = new DoubleLinkedTree();

        // 搜索器队列
        this.handlerQueue = [];

        // 通过es6的Map数据结构来解决异步共用问题，减少请求数
        if(typeof Map !== 'undefined') this.getDataMap = new Map();

        this.init();
    }
    AutoComplete.prototype = {
        constructor: AutoComplete,
        init: function(){
            var me = this;
            var timer = null;
            // 用来解决浏览器前进后退第一次搜索时内容不正确的情况
            var focusTimes = 0;

            this.$input.on('keydown', function(e){
                if(timer) clearTimeout(timer);

                timer = setTimeout(function(){
                    me.wrapper.show();

                    var key = me.$input.val();
                    me.search(key);
                    if(key === '') me.wrapper.hide();

                    clearTimeout(timer);
                    timer = null;
                }, me.delay);
            })
            .on('paste', function(e){
                    $(e.currentTarget).trigger('keydown');
                })
            .on('click', function(e){
                    var key = me.$input.val();
                    if(key !== '') {
                        me.wrapper.show();

                        // 是第一次搜索，需要做计算或加载操作
                        if(focusTimes < 2)  me.search(key);
                    }
                })
            .on('focus', function(){
                    ++focusTimes;
                })
            .on('blur', function(){
                    if(!mouseDownOnSelect) me.wrapper.hide();
                });

            var mouseDownOnSelect = false;
            me.wrapper.on('mousedown', function(){
                mouseDownOnSelect = true;
            })
            .on('mouseup', function(){
                    mouseDownOnSelect = false;
                });

            this.locate();
        },
        // 显示层定位计算
        locate: function(){
            var width = this.$input.outerWidth();
            var height = this.$input.outerHeight();
            var offset = this.$input.offset();
            var left = offset.left;
            var top = offset.top + height;

            this.wrapper.css({
                position: 'absolute',
                width: this.width || width,
                height: this.height || height,
                left: this.x || left,
                top: this.y || top
            });

            return this.wrapper;
        },
        // 添加搜索器
        addSearcher: function(opts){
            opts.fold = opts.fold != null ? opts.fold : this.fold;
            var item = new ResultItem(opts);
            this.handlerQueue.push(item);
            this.wrapper.append(item.container);

            if(this.getDataMap) {
                if(this.getDataMap.has(item.getData))
                    item.cacheResp = this.getDataMap.get(item.getData);
                else
                    this.getDataMap.set(item.getData, (item.cacheResp = {}));
            }

            return this;
        },
        /**
         * 查找操作
         * 搜索器可能有同步获取数据或者异步获取数据，将结果队列显示
         * @param key
         */
        search: function(key){
            if(!this.handlerQueue.length || key === '') return;
            if(this.noMatch) {
                if(this.lastNoMatchKey.synoSearch(key))
                    return this.showNoMatch();
                else this.noMatch.hide();
            }

            for(var def, i = 0; i < this.handlerQueue.length; ++i){
                var handler = this.handlerQueue[i];
                handler.loading();

                if(def && def.pipe) {
                    def.pipe(deferSearch(handler, key));
                } else {
                    var ret = handler.search(key);
                    if(ret && ret.pipe && typeof ret.pipe === 'function') def = ret;
                }
            }

            if(!this.noMatchTpl) return;

            // 没搜到结果
            var me = this;
            if(def && def.pipe) {
                def.then(function(){
                    me.handleNoMatch(key);
                });
            } else this.handleNoMatch(key);
        },

        // 处理没有搜索项的情况
        handleNoMatch: function(key){
            var count = 0;
            for(var i = 0; i < this.handlerQueue.length; ++i){
                if(!this.handlerQueue[i].container.is(':visible')) ++count;
            }

            if(count === this.handlerQueue.length) {
                this.lastNoMatchKey.insert(key, key);
                this.showNoMatch();
            }
        },

        showNoMatch: function(){
            if(!this.noMatch) {
                this.noMatch = $(this.noMatchTpl);
                this.wrapper.append(this.noMatch);
            }

            for(var i = 0; i < this.handlerQueue.length; ++i){
                this.handlerQueue[i].container.hide();
            }

            this.noMatch.show();
        }
    };

    function deferSearch(handler, key){
        return function(resp){
            return handler.search(key);
        };
    }

    var GUID = 0;

    /**
     * 单项搜索器构造器
     * @param opts
     * @constructor
     */
    function ResultItem(opts){
        // 获取数据的方式，必须是函数
        this.getData = opts.getData;

        var me = this;
        // 是否要折叠功能
        this.fold = opts.fold || false;
        // 搜索结果高亮
        this.highlight = opts.highlight || true;
        // 搜索结果根据关键字过滤
        this.filterBy = opts.filterBy || '*';
        // 格式化数据
        this.formatData = typeof opts.formatData === 'function'
            ? opts.formatData
            : function(){ return me.getData();};
        // 模板
        this.itemTpl = opts.itemTpl;
        //容器构造
        this.container = $('<dl id="im-search-container' + GUID++ +'" class="im-search-container"><dt class="im-result-title"></dt><dd><ul class="im-result-list"></ul><div class="im-loading">加载中...</div></dd></dl>');
        this.title = opts.title;
        if(this.title) this.container.find('.im-result-title').text(this.title);
        this.list = this.container.find('.im-result-list');

        // 注册结果项点击事件
        if(typeof opts.itemClick === 'function') this.itemClick = opts.itemClick;

        // 缓存器
        this.cache = {};
        this.cacheResp = {};

        this.initEvent();
    }
    ResultItem.prototype = {
        clearList: function(){
            var oldLis = this.list.find('> li');
            for(var i = 0; i < oldLis.length; ++i){
                oldLis.eq(i).removeData('value');
            }
            this.list.empty();
        },

        loading: function(){
            this.clearList();

            var loading = this.container.show().find('.im-loading');
            loading.show();
        },

        hideLoading: function(){
            var loading = this.container.find('.im-loading');
            loading.hide();
        },

        fillList: function(list, key){
            this.hideLoading();

            if(!list || !list.length) {
                if(this.noMatchTpl && typeof this.noMatchTpl === 'function')
                    this.list.append(this.noMatchTpl());
                else this.container.hide();

                return;
            }

            this.container.show();
            for(var i = 0; i < list.length; ++i){
                var str = '<li class="im-result-item">';
                var tpl = this.itemTpl && this.itemTpl(list[i], key) || '';
                str += tpl;
                str += '</li>';

                if(this.highlight) {
                    str = str.replace(new RegExp("(?![^&;]+;)(?!<[^<>]*)(" + key.replace(/([\^\$\(\)\[\]\{\}\*\.\+\?\|\\])/gi, "\\$1") + ")(?![^<>]*>)(?![^&;]+;)", "gi"), "<strong>$1</strong>");
                }

                var li = $(str);
                li.data('value', list[i]);
                this.list.append(li);
            }
        },
        // 返回根据关键字过滤后的结果数组
        _filterBy: function(resp, key){
            var arr = [];
            var i, item;

            if(typeof this.filterBy === 'string') {
                if(this.filterBy === '*') {
                    return resp;
                } else {
                    var segs = this.filterBy.replace(/\s+/g, '').split(',');
                    var r_keys = new RegExp('^(?:' + segs.join('|') + ')$');
                    for(i = 0; i < resp.length; ++i){
                        item = resp[i];

                        for(var prop in item){
                            if(!item.hasOwnProperty(prop)) continue;

                            if(r_keys.test(prop)
                                && item[prop]
                                && item[prop].indexOf(key) >= 0) {
                                arr.push(item);
                                break;
                            }
                        }
                    }
                }
            } else if(typeof this.filterBy === 'function') {
                var filter = this.filterBy;
                for(i = 0; i < resp.length; ++i){
                    item = resp[i];

                    if(filter(item, key)) arr.push(item);
                }
            }

            return arr;
        },
        /**
         *
         * @param key
         * @returns {*}
         */
        search: function(key){
            if(key === '') return;

            if(this.cache[key] != null) {
                this.fillList(this.cache[key], key);
                return this.cache[key];
            }

            var me = this;
            var ret = this.cacheResp[key] || this.getData(key);

            if(!ret) return this.fillList();

            if(ret.pipe && typeof ret.pipe === 'function') {
                return ret.pipe(function(resp){
                    me.handleData(resp, key);
                });
            } else {
                if(Object.prototype.toString.call(ret) === '[object Array]')
                    return me.handleData(ret, key);
                else throw new Error('data must be an Array');
            }
        },
        initEvent: function(){
            var me = this;
            var timer = null;

            this.container.on('click', 'li.im-result-item', function(e){
                if(timer) return;

                var ele = $(e.currentTarget);
                var data = ele.data('value');

                timer = setTimeout(function(){
                    me.itemClick(e, data);
                    clearTimeout(timer);
                    timer = null;
                }, 300);
            })
            .on('click', '.im-result-title', function(e){
                    var ele = $(e.currentTarget);
                    var wrapper = ele.next();

                    wrapper.toggleClass('im-search-fold').toggle();
                    ele.toggleClass('fold');
                });
        },
        handleData: function handleData(resp, key){
            resp = typeof this.formatData === 'function' ? this.formatData(resp, key) : resp;
            var arr = this._filterBy(resp, key);

            this.cacheResp[key] = resp;
            this.cache[key] = arr;
            this.fillList(arr, key);

            return arr;
        }
    };
    
    var LEAF = 'leaf';
    var BRANCH = 'branch';
    var terminal = new String('$');

    // 字典树
    function DoubleLinkedTree(symbol, kind, info){
        this.symbol = symbol || 'root';
        this.next = null;
        this.kind = kind || BRANCH;
        this.info = info || null;
        this.first = null;
    }
    DoubleLinkedTree.prototype = {
        constructor: DoubleLinkedTree,

        synoSearch: function(key){
            var p = this.first;


            for(var i = 0; p && i < key.length; ++i){
                if(p && p.kind === LEAF) break;
                while(p && p.symbol < key[i]) p = p.next;

                if(p && p.symbol === key[i])
                    p = p.first;
                else p = null;
            }

            return p && p.kind === LEAF ? p.info : null;
        },

        search: function(key){
            var p = this.first;
            var i = 0;

            while(p && i < key.length){
                while(p && p.symbol < key[i]) p = p.next;

                if(p && p.symbol === key[i]) {
                    p = p.first;
                    ++i;
                } else p = null;
            }

            return p && p.kind === LEAF ? p.info : null;
        },

        insert: function(key, value) {
        key += '';
        var cur = this;

        for (var i = 0; i < key.length; ++i) {
            var c = key[i];
            var p = cur;
            cur = cur.first;
            var node = new DoubleLinkedTree(c, BRANCH);

            // 如果没有子结点则将新结点作为子结点
            if (!cur) {
                p.first = node;
                node.parent = p;
                cur = node;
            } else {
                // 在兄弟结点中找到对应结点
                if(c < cur.symbol) {
                    node.parent = cur.parent;
                    node.next = cur;
                    node.parent.first = node;
                    cur = node;
                } else if(c > cur.symbol) {
                    var b;
                    while (cur) {
                        // 如果相等，退出该循环查找下一字符
                        if (c === cur.symbol) break;
                        // 如果小于当前字符，则插入到当前结点前面
                        else if(c < cur.symbol) {
                            node.parent = cur.parent;
                            node.next = cur;
                            b.next = node;
                            cur = node;
                            break;
                        } else {
                            b = cur;
                            cur = cur.next;
                        }
                    }

                    // 如果没有兄弟结点则插入到兄弟结点
                    if(!cur) {
                        b.next = node;
                        node.parent = b.parent;
                        cur = node;
                    }
                }
            }
        }

        // 生成叶子结点
        var success = false;
        if (cur.kind === BRANCH) {
            var child = cur.first;

            // 如果不存在关键字则说明插入成功，否则插入失败
            if(!(child && child.symbol === terminal)) {
                cur.first = new DoubleLinkedTree(terminal, LEAF, value != null ? value : key);
                cur.first.parent = cur;
                cur.first.next = child;
                success = true;
            }
        }

        return success;
    },

        remove: function(key){
            var p = this.first;
            var i = 0;

            while(p && i < key.length){
                while(p && p.symbol < key[i]) p = p.next;

                if(p && p.symbol === key[i]) {
                    p = p.first;
                    ++i;
                } else return false;
            }

            var data = p.info;
            while(!p.next && p.parent) p = p.parent;
            var top = p;

            if(top == this) {
                this.first = null;
                return data;
            }

            p = top.parent;
            if(p) {
                p = p.first;
                while(p){
                    var pre;
                    if(p == top) {
                        // 删除在first域上的子树结点
                        if(!pre) top.parent.first = top.parent.first.next;
                        // 删除在next域的兄弟结点
                        else  pre.next = pre.next.next;

                        return data;
                    } else {
                        pre = p;
                        p = p.next;
                    }
                }
            }

            return false;
        }
    };

    return AutoComplete;
})();
