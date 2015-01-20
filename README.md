# jquery-autocomplete
jquery autocomplete plugin

example:


this.searcher = new S.c.ImSearch({
	input: me.$('#im-session-search-input'),
	width: 288,
	height: $('.im-session-list').height() + 'px',
	fold: true,
	noMatchTpl: '\<div class="ac-no-match-item" style="display: block;">\<br>\<br>通讯录和会话组都没找到结果，\<br>请换个关键词试试吧！\</div>',
	highlight: true,
	delay: 600
});
		
		this.searcher
			.addSearcher({
				getData: getLocalData,
				formatData: func,
				filterBy: func,
				itemTpl: func,
				itemClick: itemClickHandler,
				title: '会话组成员搜索'
			})
			.addSearcher({
				getData: getLocalData,
				formatData: function(resp, key){
					return resp;
				},
				filterBy: 'groupName, lastMsgContent',
				itemTpl: func,
				itemClick: itemClickHandler,
				title: '会话组搜索'
			})
			.addSearcher({
				getData: getData,
				filterBy: '*',
				formatData: func,
				itemTpl: func,
				itemClick: itemClickHandler,
				title: '同事搜索'
			})
			.addSearcher({
				getData: getData,
				filterBy: 'department',
				formatData: func,
				itemTpl: func,
				itemClick: itemClickHandler,
				title: '部门搜索'
			});

			this.searcher.search('something');
