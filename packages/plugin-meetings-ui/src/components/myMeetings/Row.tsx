import { Button, Icon, ModalTrigger, Tip } from '@erxes/ui/src/components';
import { MemberAvatars } from '@erxes/ui/src/components/';
import { FlexCenter } from '@erxes/ui/src/styles/main';
import React from 'react';
import { IMeeting } from '../../types';
'@erxes/ui/src/components/MemberAvatars';
import ActionButtons from '@erxes/ui/src/components/ActionButtons';
import Form from '../../containers/myCalendar/meeting/Form';

type Props = {
  meeting: IMeeting;
  remove: () => void;
};
export const Row = (props: Props) => {
  const { meeting, remove } = props;

  const editTrigger = (
    <Button btnStyle="link">
      <Tip text={'Edit'} placement="top">
        <Icon icon="edit-3" />
      </Tip>
    </Button>
  );

  const renderRemoveButton = onClick => {
    return (
      <Tip text={'Delete'} placement="top">
        <Button btnStyle="link" onClick={onClick} icon="times-circle" />
      </Tip>
    );
  };

  const content = props => <Form {...props} meeting={meeting} />;

  return (
    <tr>
      <td>{meeting.title}</td>
      <td>{meeting.createdUser?.username || ''}</td>
      <td>{meeting.createdAt}</td>
      <td>
        <FlexCenter>
          <MemberAvatars
            selectedMemberIds={meeting.participantIds}
            allMembers={meeting.participantUser}
          />
        </FlexCenter>
      </td>
      <td>{meeting.status}</td>
      <td>
        <ActionButtons>
          <ModalTrigger
            title="Edit tag"
            trigger={editTrigger}
            content={content}
          />
          {renderRemoveButton(remove)}
        </ActionButtons>
      </td>
    </tr>
  );
};
