# bot-completion.bash — gợi ý tham số/option cho lệnh `bot` (bash)
#
# Cài đặt 1 lần:
#   echo 'source /home/khoablabla/geasf/bots/bot-completion.bash' >> ~/.bashrc
#   source ~/.bashrc
# Hoặc dùng ngay trong terminal hiện tại:
#   source /home/khoablabla/geasf/bots/bot-completion.bash
#
# Gõ `bot <TAB>` -> gợi ý lệnh + tên bot; `bot start <TAB>` -> tên bot; ...

# Project root = thư mục cha của thư mục chứa file này (…/bots -> …)
_BOT_COMPLETE_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"

_bot_complete_names() {
    local reg="$_BOT_COMPLETE_ROOT/bots.conf" n
    declare -A _seen=()
    # 1) từ registry bots.conf (dòng: ten|dir, # là comment)
    if [[ -f "$reg" ]]; then
        while IFS= read -r line || [[ -n "$line" ]]; do
            line="${line%%#*}"
            n="${line%%|*}"
            n="$(echo "$n" | tr -d '[:space:]')"
            [[ -z "$n" ]] && continue
            [[ -n "${_seen[$n]:-}" ]] && continue
            _seen[$n]=1
            printf '%s\n' "$n"
        done < "$reg"
    fi
    # 2) quét filesystem (phòng khi bot chưa vào registry)
    local f b
    for f in "$_BOT_COMPLETE_ROOT"/bots/*.sh \
             "$_BOT_COMPLETE_ROOT"/*/bots/*.sh; do
        [[ -e "$f" ]] || continue
        b="$(basename "$f" .sh)"
        case "$b" in *_tmux|*_backup|*_old|test_*) continue ;; esac
        [[ -n "${_seen[$b]:-}" ]] && continue
        _seen[$b]=1
        printf '%s\n' "$b"
    done
}

_bot_complete() {
    local cur prev cmd
    COMPREPLY=()
    cur="${COMP_WORDS[COMP_CWORD]}"
    prev="${COMP_WORDS[COMP_CWORD-1]}"
    cmd="${COMP_WORDS[1]:-}"

    local -a cmds=(start stop restart list ls status st info add remove rm
                   download dl tunnel tn edit attach ta doctor help version)
    local -a flags=(-f --force -y --yes -a --all -A -p --purge)
    local -a dl_subs=(on off status stop)
    local -a tn_subs=(on off status)

    # --bot <flag> đang nhập dở -> gợi ý flags
    if [[ "$cur" == -* ]]; then
        COMPREPLY=($(compgen -W "${flags[*]}" -- "$cur"))
        return 0
    fi

    case "$cmd" in
        ""|help|-h|--help|h)
            # bot <TAB> : lệnh + tên bot (vì `bot <tên>` = `bot start <tên>`)
            COMPREPLY=($(compgen -W "${cmds[*]} $(_bot_complete_names)" -- "$cur"))
            return 0
            ;;
        download|dl)
            # vị trí 1 = đang gõ tên lệnh (vd `bot d<TAB>`) -> gợi ý lệnh
            if [[ $COMP_CWORD -eq 1 ]]; then
                COMPREPLY=($(compgen -W "${cmds[*]} $(_bot_complete_names)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "${dl_subs[*]}" -- "$cur"))
            fi
            return 0
            ;;
        tunnel|tn)
            if [[ $COMP_CWORD -eq 1 ]]; then
                COMPREPLY=($(compgen -W "${cmds[*]} $(_bot_complete_names)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "${tn_subs[*]}" -- "$cur"))
            fi
            return 0
            ;;
        start|run|stop|kill|restart|rst|status|st|stat|info|edit|attach|ta|remove|rm|del|delete)
            # vị trí 1 = đang gõ tên lệnh (vd `bot st<TAB>`) -> gợi ý lệnh
            if [[ $COMP_CWORD -eq 1 ]]; then
                COMPREPLY=($(compgen -W "${cmds[*]} $(_bot_complete_names)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "all $(_bot_complete_names) ${flags[*]}" -- "$cur"))
            fi
            return 0
            ;;
        add)
            # bot add <file.sh|thư mục> -> gợi ý file/thư mục
            COMPREPLY=($(compgen -f -- "$cur"))
            return 0
            ;;
        list|ls|doctor|check|version)
            COMPREPLY=()
            return 0
            ;;
        *)
            # từ lạ ở vị trí lệnh: có thể là tên bot (`bot geasf` = start)
            if [[ $COMP_CWORD -eq 1 ]]; then
                COMPREPLY=($(compgen -W "${cmds[*]} $(_bot_complete_names)" -- "$cur"))
            else
                COMPREPLY=($(compgen -W "$( _bot_complete_names) ${flags[*]}" -- "$cur"))
            fi
            return 0
            ;;
    esac
}

complete -F _bot_complete bot
